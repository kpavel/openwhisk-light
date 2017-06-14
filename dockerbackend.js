var Docker = require('dockerode');
var urllib = require("url");
var validator = require('validator');
const os = require("os");

const messages = require('./messages');
var actionproxy = require('./actionproxy');

var _ = require("underscore");

const config = require("./config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option
var totalCapacity = config.total_capacity || 10; // maximum amount of action containers that we can run
const initTimeout = config.init_timeout || 10000; // action container init timeout in milliseconds


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


class DockerBackend {

  constructor (options) {
    this.docker = new Docker(this.parse_options(options));

    // in case this environment variable specified this network will be used for action containers.
    this.nwName = process.env.OW_LOCAL_DOCKER_NW_NAME;
    this.myIP = "unknown";

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
        });
        console.log('Retrieving my IP');
        that.get_ip_in_net(this.nwName).then((ip) => {
          that.myIP = ip;
          console.log("My IP: " + that.myIP);
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

    const host = urllib.parse(dockerurl).hostname;
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

  // find our own IP resolvable from the given virtual network
  // ----
  // this IP will be passed to the action containers as __OW_API_HOST
  // flow:
  // 1) find the subnet of the given virtual network
  // 2) if we have net interface with IP on that subnet, return this IP
  // 3) otherwise, return the default gateway of that subnet
  //    (assuming that we are running on the docker host)
  get_ip_in_net(nwName) {
    var that = this;
    var os = require('os');
    var ip = require('ip');
    return new Promise((resolve,reject) => {
        // get network info
        that.docker.getNetwork(nwName).inspect((err, networkInfo) => {
          if(err){
            console.log("Err: " + JSON.stringify(err));
            return reject(err);
          }

          // get subnet of the Docker network with the given name
          //console.log("net: " + JSON.stringify(networkInfo.IPAM.Config));
          var subnet = networkInfo.IPAM.Config[0].Subnet;
          var gateway = networkInfo.IPAM.Config[0].Gateway.split('/')[0];
          console.log("subnet: " + subnet);
          // inspect OS settings to find self IP in the above subnet
          var ifaces = os.networkInterfaces();
          //console.log(JSON.stringify(ifaces));
          for (var iface in ifaces) {
            var iface = ifaces[iface];
            for (var alias in iface) {
              var alias = iface[alias];
              //console.log(JSON.stringify(alias));
              if ('IPv4' !== alias.family || alias.internal !== false) {
                continue;
              }
              console.log("Found address: " + alias.address);
              if(ip.cidrSubnet(subnet).contains(alias.address)) {
                console.log("FOUND match for " + subnet);
                return resolve(alias.address);
              }
            }
          }
          // if got here, we are probably running on the host itself
          console.log("NO match found, returning gateway address: " + gateway);
          resolve(gateway);
        });
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

  // preemption moved to a separate class

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
            // TODO: use 'init' method of 'action' class, hiding the exact arguments passed to proxy
            actionproxy.init(address, payload).then((result) =>{
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
  invoke(actionName, params, api_key){
    var that = this;

    return new Promise(function(resolve,reject) {
      that.getActionContainer(actionName).then((actionContainer)=>{
        // append params from action metadata
        that.actions[actionName].parameters.forEach(function(param) { params[param.key]=param.value; });
        if(actionContainer.state == "running"){
          // TODO: use 'run' method of 'action' class, hiding the exact arguments passed to proxy
          actionproxy.run(actionName, actionContainer.address, api_key, params).then(function(result){
            actionContainer['used'] = process.hrtime()[0];
            delete actionContainer.busy;
            return resolve(result);
          }).catch(function(err){
            console.log("invoke request failed with " + err);
            actionContainer['state'] = 'running';
            delete actionContainer.busy;

            return reject(err);
          });
        }else{
          console.log("Container " + JSON.stringify(actionContainer) + " registered as not running, starting container");
          that.start(actionName, actionContainer).then(function(address){
            console.log("--- container started with address: " + JSON.stringify(address));
            // TODO: use 'run' method of 'action' class, hiding the exact arguments passed to proxy
            actionproxy.run(actionName, address, api_key, params).then(function(result){
              console.log("invoke request returned with " + result);
              actionContainer['used'] = process.hrtime()[0];
              delete actionContainer.busy;
              return resolve(result);
            }).catch(function(err){
              console.log("invoke request failed with " + err);
              actionContainer['state'] = 'running';
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
    	
	  if(!that.actions[actionName]){
        //no cached action, throwing ACTION MISSING error so the caller will know it needs to be created
        return reject(messages.ACTION_MISSING_ERROR);
      }
    	
      var actionContainers = that.containers[actionName] || [];

      // locking containers object
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
          // no free container, creating a new one
          // Reserving the entry in cash to release lock asap
          var actionContainer = {state: "reserved", busy: process.hrtime()[0], used: process.hrtime()[0], actionName};
          that.containers[actionName].push(actionContainer);
          release();

          that.createContainer(actionName).then((container)=>{
            actionContainer.container = container;
            resolve(actionContainer);
          });
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

          that.docker.modem.followProgress(stream, (err, output) => {
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

  // delete local action from pool.
  deleteAction(actionName){
    console.log("in deletee " + actionName);
        delete this.actions[actionName];
  };

  createContainer(actionName){
    var that = this;
    var action = this.actions[actionName];
    var image = action.exec.image || action.exec.kind.replace(":", "") + "action";
    return new Promise((resolve, reject) => {
      that.docker.createContainer({
        Tty: true, Image: image,
        NetworkMode: that.nwName, 'HostConfig': {NetworkMode: that.nwName, CgroupParent: cgroupParent},
        Env: ["__OW_API_HOST="+"http://"+this.myIP+":"+process.env.PORT],
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

module.exports = DockerBackend;
