var Docker = require('dockerode');
var urllib = require("url");
var validator = require('validator');
const os = require("os");

const messages = require('./messages');

var _ = require("underscore");

const config = require("./config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option
var totalCapacity = config.total_capacity || 0; // maximum amount of action containers that we can run
const initTimeout = config.init_timeout || 10000; // action container init timeout in milliseconds
const moment = require("moment");

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

var STATE    = require('./utils').STATE;

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
  
  startContainer(actionContainer){
    var that = this;

    var container = actionContainer.container;
    actionContainer.logs = [];

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
            var logStream=PassThrough();
            logStream.on('data', function(data) {
                
/*                console.log("data: " + data);
                console.log("JSON.parse(data): " + JSON.parse(data));
                console.log("JSON.parse(data.toString('utf8')): " + JSON.parse(data.toString('utf8')));
                console.log("JSON.stringify( JSON.parse(data): " + JSON.stringify(JSON.parse(data)));
                console.log("JSON.stringify( JSON.parse(data.toString('utf8')): " + JSON.stringify(JSON.parse(data.toString('utf8'))));
*/
                 data = data.toString('utf8').split("\r\n");
                 data.forEach(function(element) {
                     if(element && !(element.endsWith("XXX") && element.startsWith("XXX"))){
                         actionContainer.logs.push(moment().format('YYYY-MM-DD hh:mm:ss.SSS ') + element);
                     }
                 });
            });
            stream.pipe(logStream);
          });

          actionContainer.address = containerInfo.NetworkSettings.Networks[that.nwName].IPAddress;
          resolve();
        });
      });
    });
  }

  getActionContainer(actionName, action){
    var that = this;

    return new Promise((resolve, reject) => {
    	
      var actionContainers = that.containers[actionName] || [];

      // locking containers object
      that.containersLock.writeLock(function (release) {

        ///////
        // First looking for available running container
        var activeContainers = actionContainers.filter((container) => {
          return container.state == STATE.running;
        });

        if(activeContainers.length){
          activeContainers[0].state = STATE.allocated; //storing timestamp of when container became busy for preemption purposes
          console.log('---RELEASE 0');
          release();
          return resolve(activeContainers[0]);
        }

        ////////
        // All running containers busy, will have to start a stopped one or create a new one, checking that total capacity not reached
        var activeContainersNum = 0;
        for(var key in that.containers){
          activeContainersNum += _.filter(that.containers[key], (o) => {
            return (o.state != STATE.stopped);
          }).length;
        }

        console.log("checking if didn't reach full capacity: " + activeContainersNum + "<" + totalCapacity * that.nodesNumber);
        if(activeContainersNum >= totalCapacity * that.nodesNumber){
          release();
          return reject(messages.TOTAL_CAPACITY_LIMIT);
        }

        // Now looking for already created, but stopped container
        actionContainers = actionContainers.filter((container) => {
          return container.state == STATE.stopped;
        });

        if(actionContainers.length){
          actionContainers[0].state = STATE.reserved;
          release();

          that.startContainer(actionContainers[0]).then(function(){
            actionContainers[0].state = STATE.allocated;
            resolve(actionContainers[0]);
          });
        }else{
          // no free container, creating a new one
          // Reserving the entry in cash to release lock asap
          var actionContainer = {state: STATE.reserved, used: process.hrtime()[0], actionName};
          that.containers[actionName].push(actionContainer);
          release();

          that.createContainer(actionName, action).then((container)=>{
            actionContainer.container = container;
            actionContainer.kind = action.exec.kind;
            
            that.startContainer(actionContainer).then(function(){
              actionContainer.state = STATE.allocated;
              console.log("address: " + actionContainer.address);
              resolve(actionContainer);
            });
          });
        }
      });
    });
  }

  // pulls docker image from docker hub in case of blackbox action kind
  // TODO: add validations that action image exists
  // TODO: deprecate containers
  create(actionName, kind, image){
    console.log("in " + actionName + " action create");
    var that = this;
    return new Promise((resolve, reject) => {
      if(!that.containers[actionName]){
        that.containers[actionName] = [];
      }

      if(kind == "blackbox"){
        console.log("pulling image " + image);
        that.docker.pull(image, function(err, stream){
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
              return resolve();
            }
          });
        });
      }else{
        console.log("action registered: " + actionName);
        return resolve();
      }
    });
  };

  createContainer(actionName, action){
    var that = this;
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
