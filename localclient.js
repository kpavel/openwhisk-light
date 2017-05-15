
var Docker = require('dockerode');
var urllib = require("url");
var validator = require('validator');

const rp = require('request-promise')
const messages = require('./messages');

var cron = require("cron");
var _ = require("underscore");
const os = require("os");


const openwhisklocal = require("./openwhisklocal.js") || {}; // holds node specific settings, consider to use another file, e.g. openwhisklocal.js as option
const totalCapacity = process.env.TOTAL_CAPACITY || openwhisklocal.totalCapacity; // max number of containers per host 
const initTimeout = openwhisklocal.initTimeout || 10000; // action container init timeout in milliseconds


/////////////////////////////////////////////////////////////
// PrefixStream, requiered to make prefixes in container logs
/////////////////////////////////////////////////////////////
var util    = require('util');
var stream  = require('stream');

var PassThrough = stream.PassThrough ||
  require('readable-stream').PassThrough;

var duplex  = require('duplexer');
var split   = require('split');
var through = require('through');

var cgroupParent = process.env.CGROUP_PARENT;

function PrefixStream (prefix) {
  if ( ! (this instanceof PrefixStream)) {
    return new PrefixStream(prefix);
  }

  prefix = prefix || '';

  this.inStream   = new PassThrough();
  this.outStream  = new PassThrough();

  var tr = through(function(line){
    line = util.format('%s%s\n', prefix, line);
    this.queue(line);
  });

  this.inStream
    .pipe(split())
    .pipe(tr)
    .pipe(this.outStream);

  return duplex(this.inStream, this.outStream);
};


class LocalClient {

  constructor (options) {
    this.docker = new Docker(this.parse_options(options));
    
    // in case this environment variable specified this network will be used for action containers.
    this.nwName = process.env.OW_LOCAL_DOCKER_NW_NAME;

    //e.g. { $ACTION_NAME: [{ state: "created", container: container_object, used: timestamp_seconds... , ] };
    this.containers = {};

    //e.g. { $ACTION_NAME: "exec": { "kind": "nodejs", "code": "function main(params) {}" .... },}
    this.actions = {};

    var ReadWriteLock = require('rwlock');
    this.containersLock = new ReadWriteLock();

    // TODO: as containers kept in memory when agent restarted what should happen with it's containers?
    this.cleanup({ "label": [ "action" ] });
    
    var that = this;
    this.get_nw_name().then((nwName)=>{
      that.nwName = nwName;

      if(!nwName){
        throw new Error("Failed to discover docker network");
      }else{
        that.get_number_of_nodes().then((nodes) => {
          that.nodesNumber = nodes;
          that.start_preemption();
        });
      }
    });
  }

  parse_options (options) {
    const socketPath = options.socketPath;
    var dockerurl = options.dockerurl;

    if (/\/$/.test(dockerurl)) {
        dockerurl = dockerurl.substring(dockerurl.length-1);
    }

    const host = dockerurl;
    const port = urllib.parse(dockerurl).port || 2375;

    if (!host && !socketPath) {
      throw new Error(`${messages.INVALID_OPTIONS_ERROR} Missing either docker host or socket path parameters.`)
    }

    return {host, port, socketPath};
  }

  get_number_of_nodes(){
    var that = this;
    return new Promise(function(resolve,reject) {
      that.docker.info(function(err, res){
        if(err){
            return reject(err);
        }else{
            if(res.SystemStatus){
              resolve(res.SystemStatus.filter(function(item){return item[0]=="Nodes"})[0][1]);
            }else{
              // assuming it's not running in cluster
              resolve(1);
            }
        }
      });
    });
  }

  // get network name of the container the current runtime executed in
  get_nw_name(){
    var that = this;
    return new Promise((resolve,reject) => {
      const hostname = os.hostname();
      console.log("-hostname: " + hostname);

      if(that.nwName){
        resolve(that.nwName);
      }else{
        // get node container info
        that.docker.getContainer(hostname).inspect((err, containerInfo) => {
          if(err){
            console.log("jErr: " + JSON.stringify(err));
            return reject(err);
          }

          // get network name
          that.nwName = Object.keys(containerInfo.NetworkSettings.Networks)[0];
          resolve(that.nwName);
        });
      }
    });
  };

  //TODO: Do we need cleanup at all? Preemption should handle it much better
  // e.g. to cleanup all containers having "action" label: var filter = { "label": [ "action" ] };
  cleanup(filter){
    var that = this;

    function fn_rm(containerInfo){
      return new Promise((resolve) => {
        const container = that.docker.getContainer(containerInfo.Id);
        container.stop(function(data){
          container.remove(function(data){
            resolve();
          });
        });
      }); 
    };

    const opts={ "filters": filter, all: true};
    return new Promise((resolve,reject) => {
      that.docker.listContainers(opts, function (err, containers) {
        if(containers.length > 0){
          Promise.all(containers.map(fn_rm)).then((responses) => {console.log("Containers cleanup finished"); resolve()});
        }else{
          console.log("nothing to cleanup");
          resolve();
        }
      });
    });
  };

  start_preemption(){
    const that = this;
    console.log("openwhisklocal settings: " + JSON.stringify(openwhisklocal));

    const preeemptionPeriod = openwhisklocal.preeemptionPeriod || 300;     // how often to check whether containers should be stopped
    const preemption_high_percent = openwhisklocal.preemption_high_percent || 0.75;
    const preemption_low_percent = openwhisklocal.preemption_low_percent || 0.25;

    const preemptionHighThresholdPerHost = totalCapacity * preemption_high_percent;  // indicates when preeption should be started (75% of max amount)
    const preemptionLowThresholdPerHost = totalCapacity * preemption_low_percent;    // low and high thresholds define an optimal window of containers performace and host utilization balance

    const factors = openwhisklocal.factors || {}; // preemption factor per image type, e.g. java/blackbox container may take more time to start than js one

    //TODO: rename
    const containerCleanup = openwhisklocal.containerCleanup || 300; //seconds

    var cronjob = new cron.CronJob('*/' + preeemptionPeriod +' * * * * *',
      function() {
        console.log("checking whether containers preemption applicable");
        that.get_number_of_nodes().then((nodes) => {
          that.nodesNumber = nodes;
          console.log("system running on " + nodes + " nodes, checking if running containers amount is greater than " + nodes * preemptionHighThresholdPerHost);
          
          var currentTime = process.hrtime()[0];
          var activeContainers = [];
          var inactiveContainers = [];

          /////////////
          // Locking the containers cache
          that.containersLock.writeLock(function (release) {
            for(var action in that.actions){
              activeContainers = activeContainers.concat(_.where(that.containers[action], {state: "running"}));
              
              //  TODO: move inactive containers handling to separate cron job
              inactiveContainers = inactiveContainers.concat(_.filter(that.containers[action], function(o){
                return ((currentTime - o.used) > containerCleanup);
              }));
            }
          
            console.log("activeContainers length: " + activeContainers.length);
            if(activeContainers.length >= nodes * preemptionHighThresholdPerHost){
              console.log("-starting premption as activeContainers number greater than " + nodes * preemptionHighThresholdPerHost);

              // sort active containers by (currentTime - last invoked hrtime) * factor
              var sortedContainers = _.sortBy(activeContainers, function(o){
                var factor = factors[that.actions[o.actionName].exec.kind] || 1;
                return ((currentTime - o.used) / factor);
              }).reverse();

              console.log("-need to stop " + (sortedContainers.length - nodes * preemptionLowThresholdPerHost) + " from " + sortedContainers.length);  
              sortedContainers = sortedContainers.slice(0, sortedContainers.length - nodes * preemptionLowThresholdPerHost);

              var fnStop = function stop(containerInfo){
                return new Promise((resolve) => {
                  containerInfo.container.stop(function(data){
                    containerInfo['state'] = 'stopped';
                    delete containerInfo['address'];
                    delete containerInfo['busy'];
                    resolve();
                  });
                }); 
              };

              var actions = sortedContainers.map(fnStop);

              var fnRm = (containerInfo) => {
                return new Promise((resolve) => {
                  if(!containerInfo.container){
                    resolve();
                  }
                  containerInfo.container.stop(function(data){
                    containerInfo.container.remove(function(data){
                      const containerArray = that.containers[containerInfo.actionName];
                      containerArray.splice(containerArray.indexOf(containerInfo), 1);
                      resolve();
                    });
                  });
                }); 
              };

              ///////
              // TODO: Cleanup containers
              console.log("inactiveContainers length: " + inactiveContainers.length);
              actions = actions.concat(inactiveContainers.map(fnRm));

              ///////
              // TODO: Mark cleaned up containers as busy to release lock asap
              // sortedContainers.forEach((c)=>{
              //   console.log("c: " + JSON.stringify(c));
              //   c.busy = true;
              // });
              // inactiveContainers.forEach((c) => {
              //   c.busy = true;
              // });
              
              
              Promise.all(actions).then((responses) => {console.log("Containers preemption finished");release();});
            }else{
              release();
              console.log("no need for preeption to start, didn't reach the limit yet: " + activeContainers.length + "<" + nodes * preemptionHighThresholdPerHost);
            }
          });
        });
      },
      null,true);
  }

  start(actionName, actionContainer){
    var that = this;
    console.log("Action " + actionName + ", starting container");

    var container = actionContainer.container;
    var action = that.actions[actionName];

    return new Promise((resolve, reject) => {
      container.start(function (err, data) {

        if(err){
          console.log("-----------ERROR STARTING CONTAINER: " + JSON.stringify(err));

          if(JSON.stringify(err).indexOf("cannot allocate memory") > 0){
            err = new Error(messages.MEMORY_LIMIT);
          }
          
          return reject(err);
        }

        console.log("Container started");
        container.inspect(function (err, containerInfo) {
          var prefix = containerInfo.Name.substr(1) + ": ";

          console.log("Container containerInfo: " + JSON.stringify(containerInfo));
          container.attach({stream: true, stdout: true, stderr: true}, function (err, stream) {
            stream.pipe(PrefixStream(containerInfo.Name.substr(1) + ": ")).pipe(process.stdout); 
          });

          var address = containerInfo.NetworkSettings.Networks[that.nwName].IPAddress;
          var payload;
          if(action.exec.kind == "java"){
              payload = {value: { main: action.exec.main, jar: action.exec.code, code: action.exec.code}};
          }else{
              payload = {value: { main: "main", code: action.exec.code}};
          }
              
          if(action.exec.code && validator.isBase64(action.exec.code)){
            payload.value['binary'] = true;
          }
          
          const RETRY_TIMEOUT = 100;
          var retries = initTimeout / RETRY_TIMEOUT
          var waitToInit = function(){
            if(--retries == 0){
              return reject(messages.INIT_TIMEOUT_ERROR);
            }
            that.request("POST", "http://" + address + ":8080/init", payload ).then((result) =>{
              if(!result.OK && result != "OK"){
                console.log(JSON.stringify(result) + " is not OK");

                container.top({ps_args: 'aux'}, function(err, data) {
                  if(err){
                    console.log("container top returned error: " + JSON.stringify(err));
                    return reject(err);
                  }else{
                    console.log("TOP OUTPUT: " + JSON.stringify(data));
                  }
                });

                setTimeout(waitToInit, RETRY_TIMEOUT);
              }else{
                console.log("Container inited!");
                Object.assign(actionContainer, {'state': "running", 'used': process.hrtime()[0], address});
                return resolve(address);
              }
            }).catch(err => {
              console.log("Error initing container, retrying: " + err);

              //TODO: add timeout instead ot retries
              setTimeout(waitToInit, RETRY_TIMEOUT);
            });
          };

          waitToInit();
        });
      });
    });
  }

  request (method, url, body) {
    const req = this.params(method, url, body);
    return rp(req);
  }

  params (method, url, body) {
    return Object.assign({
      json: true,
      method: method,
      url
    }, {body})
  }

  // using locks to prevent races
  
  // from containers pool get first unused CONTAINER of specified ACTION_NAME
  // mark CONTAINER entry as used
  
  // if !CONTAINER
  //     get ACTION by ACTION_NAME from actions object
  //     if !ACTION
  //        throw ACTION_MISSING_ERROR

  //         get ACTION from OpenWhisk Global server using credentials
  //         store ACTION under actions cache
        
  //     create CONTAINER of ACTION KIND based on image name convention
  //     add CONTAINER to containers pool (as used)
  //     init CONTAINER based on ACTION details
  //     start CONTAINER
  
  // invoke action on CONTAINER
  // return CONTAINER back to containers pool
  // return invoke result
  invoke(actionName, params){
    var that = this;

    return new Promise(function(resolve,reject) {
      that.getActionContainer(actionName).then((actionContainer)=>{
        if(actionContainer.state == "running"){
          that.request("POST", "http://" + actionContainer.address + ":8080/run", {"value": params}).then(function(result){
            actionContainer['used'] = process.hrtime()[0];
            delete actionContainer.busy;
            return resolve(result);
          });
        }else{
          console.log("Container " + JSON.stringify(actionContainer) + " registered as not running, starting container");
          that.start(actionName, actionContainer).then(function(address){
            console.log("--- container started with address: " + JSON.stringify(address));
            that.request("POST", "http://" + address + ":8080/run", {"value": params}).then(function(result){
              console.log("invoke request returned with " + result);
              actionContainer['used'] = process.hrtime()[0];
              delete actionContainer.busy;
              return resolve(result);
            }).catch(function(err){
              console.log("invoke request failed with " + err);
              actionContainer['state'] = 'stopped';
              delete actionContainer.busy;

              return reject(err);
            });
          }).catch(function(err){
            console.log("action invoke failed with " + err);
            
            //releasing container busy flag;
            actionContainer['state'] = 'stopped';
            delete actionContainer.busy;

            return reject(err);
          });
        }
      }).catch(function(err){
        return reject(err);
      });
    });
  };

  getActionContainer(actionName){
    var that = this;

    return new Promise((resolve, reject) => {
      var actionContainers = that.containers[actionName] || [];
      
      // locaking containers object
      that.containersLock.writeLock(function (release) {

        ///////
        // First looking for available running container  
        var activeContainers = actionContainers.filter((container) => {
          return !container.busy && container.state == "running"; 
        });

        if(activeContainers.length){
          activeContainers[0].busy = process.hrtime()[0]; //storing timestamp of when container became busy for preemption purposes
          console.log('---RELEASE 0');
          release();
          return resolve(activeContainers[0]);
        }
        
        ////////
        // All running containers busy, will have to start a stopped one or create a new one, checking that total capacity not reached
        var activeContainersNum = 0;
        for(var name in that.actions){
          activeContainersNum += _.filter(that.containers[name], (o) => {
            return (o.state == "running" || o.state == "reserved" || o.busy);
          }).length;
        }

        console.log("checking if didn't reach full capacity: " + activeContainersNum + "<" + totalCapacity * that.nodesNumber);
        if(activeContainersNum >= totalCapacity * that.nodesNumber){
          release();
          return reject(messages.TOTAL_CAPACITY_LIMIT);
        }

        // Now looking for already created, but stopped container
        actionContainers = actionContainers.filter((container) => {
          return !container.busy && container.state == "stopped"; 
        });
        
        if(actionContainers.length){
          actionContainers[0].busy = process.hrtime()[0]; //storing timestamp of when container became busy for preemption purposes
          release();

          // Releasing and returning stopped container asap 
          resolve(actionContainers[0]);
        }else{
          //no free container, creating a new one
          var action = that.actions[actionName];
          if(!action){
            //no cached action, throwing ACTION MISSING error so the caller will know it needs to be created
            release();
            reject(messages.ACTION_MISSING_ERROR);
          }else{
            // Reserving the entry in cash to release lock asap
            var actionContainer = {state: "reserved", busy: process.hrtime()[0], used: process.hrtime()[0], actionName};
            that.containers[actionName].push(actionContainer);
            release();

            that.createContainer(action).then((container)=>{
              actionContainer.container = container;
              resolve(actionContainer);
            });
          }
        }
      });
    });
  }

  // stores action in local action pool. pulls docker image from docker hub in case of blackbox action kind
  // TODO: add validations that action image exists
  create(actionName, action){
    console.log("in " + actionName + " action create with: " + JSON.stringify(action));
    var that = this;
    return new Promise((resolve, reject) => {
      var kind = action.exec.kind;
      if(!that.containers[actionName]){
        that.containers[actionName] = [];
      }
      
      if(kind == "blackbox"){
        console.log("pulling image " + action.exec.image);
        that.docker.pull(action.exec.image, function(err, stream){
          if(err){
            console.log("Error pulling docker image: " + JSON.stringify(err));
            return reject(err);
          }

          docker.modem.followProgress(stream, (err, output) => {
            if(err){
              console.log("Error pulling docker image: " + JSON.stringify(err));
              return reject(err);
            }else{
              console.log("pull finished: " + JSON.stringify(output));
              that.actions[actionName] = action;
              return resolve();
            }
          });
        });
      }else{
        console.log("action registered: " + actionName);
        that.actions[actionName] = action;
        return resolve();
      }
    });
  };

  createContainer(action){
    var that = this;
    var image = action.exec.image || action.exec.kind.replace(":", "") + "action";
    return new Promise((resolve, reject) => {
      that.docker.createContainer({
        Tty: true, Image: image,
        NetworkMode: that.nwName, 'HostConfig': {NetworkMode: that.nwName, CgroupParent: cgroupParent},
        Labels: {"action": action.name}},
        function (err, container) {
          if(err){
            console.log("ERROR CREATING CONTAINER:  " + JSON.stringify(err));
            return reject(err);
          }else{
            console.log("container created: " + JSON.stringify(container));
            return resolve(container);
          }
        }
      );
    });
  };

}

module.exports = LocalClient;