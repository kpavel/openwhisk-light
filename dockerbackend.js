const Docker = require('dockerode'),
      urllib = require("url"),
      os = require("os"),
      _ = require("underscore"),
      moment = require("moment"),
      util    = require('util'),
      stream  = require('stream'),
      PassThrough = stream.PassThrough || require('readable-stream').PassThrough,
      duplex  = require('duplexer'),
      split   = require('split'),
      through = require('through'),
      ReadWriteLock = require('rwlock'),
      ip = require('ip'),

      config = require("./config"),
      messages = require('./messages'),
      STATE    = require('./utils').STATE;

/////////////////////////////////////////////////////////////
// PrefixStream, requiered to make prefixes in container logs
/////////////////////////////////////////////////////////////
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
    this.docker = new Docker(this._parse_options(options));

    // in case this environment variable specified this network will be used for action containers.
    this.nwName = config.docker_net_name;
    this.myIP = "unknown";

    //e.g. { $ACTION_NAME: [{ state: "created", container: container_object, used: timestamp_seconds... , ] };
    this.containers = {};
    this.containersLock = new ReadWriteLock();

    // remove all action containers (having label "action")
    this._cleanup({ "label": [ "action" ] });

    var that = this;
    this._get_nw_name().then((nwName)=>{
      that.nwName = nwName;

      if(!nwName){
        throw new Error("Failed to discover docker network");
      }else{
        that._get_number_of_nodes().then((nodes) => {
          that.nodesNumber = nodes;
        });
        console.debug('Retrieving my IP');
        that._get_ip_in_net(this.nwName).then((ip) => {
          that.myIP = ip;
          console.debug("My IP: " + that.myIP);
        });
      }
    });
  }

  _parse_options (options) {
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

  _get_number_of_nodes(){
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
  _get_nw_name(){
    var that = this;
    return new Promise((resolve,reject) => {
      const hostname = os.hostname();
      console.debug("hostname: " + hostname);

      if(that.nwName){
        resolve(that.nwName);
      }else{
        // get node container info
        that.docker.getContainer(hostname).inspect((err, containerInfo) => {
          if(err){
            console.error("failed to discover network name: " + JSON.stringify(err));
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
  _get_ip_in_net(nwName) {
    var that = this;
    return new Promise((resolve,reject) => {
        // get network info
        that.docker.getNetwork(nwName).inspect((err, networkInfo) => {
          if(err){
            console.error("Failed to discover docker network: " + JSON.stringify(err));
            return reject(err);
          }

          // get subnet of the Docker network with the given name
          //console.log("net: " + JSON.stringify(networkInfo.IPAM.Config));
          var subnet = networkInfo.IPAM.Config[0].Subnet;
          var gateway = networkInfo.IPAM.Config[0].Gateway.split('/')[0];
          console.debug("subnet: " + subnet);
          // inspect OS settings to find self IP in the above subnet
          var ifaces = os.networkInterfaces();
          for (var iface in ifaces) {
            var iface = ifaces[iface];
            for (var alias in iface) {
              var alias = iface[alias];
              if ('IPv4' !== alias.family || alias.internal !== false) {
                continue;
              }
              console.debug("Found address: " + alias.address);
              if(ip.cidrSubnet(subnet).contains(alias.address)) {
                console.debug("FOUND match for " + subnet);
                return resolve(alias.address);
              }
            }
          }
          // if got here, we are probably running on the host itself
          console.debug("NO match found, returning gateway address: " + gateway);
          resolve(gateway);
        });
    });
  };

  //TODO: Consider to move the cleanup code to preemption in a scope of container deprecation PR
  // e.g. to cleanup all containers having "action" label: var filter = { "label": [ "action" ] };
  _cleanup(filter){
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

    const opts={"filters": filter, all: true};
    return new Promise((resolve,reject) => {
      that.docker.listContainers(opts, function (err, containers) {
        if(containers.length > 0){
          Promise.all(containers.map(fn_rm)).then((responses) => {console.log("Containers cleanup finished"); resolve()});
        }else{
          console.debug("nothing to cleanup");
          resolve();
        }
      });
    });
  };
  
  _startContainer(actionContainer){
    var that = this;

    var container = actionContainer.container;
    actionContainer.logs = [];

    return new Promise((resolve, reject) => {
      container.start(function (err, data) {

        if(err){
          console.error("error starting container: " + JSON.stringify(err));

          if(JSON.stringify(err).indexOf("cannot allocate memory") > 0){
            err = new Error(messages.MEMORY_LIMIT);
          }

          return reject(err);
        }

        console.debug("Container started");
        container.inspect(function (err, containerInfo) {
          var prefix = containerInfo.Name.substr(1) + ": ";

//          console.debug("Container containerInfo: " + JSON.stringify(containerInfo));
          container.attach({stream: true, stdout: true, stderr: true}, function (err, stream) {
            stream.pipe(PrefixStream(containerInfo.Name.substr(1) + ": ")).pipe(process.stdout);
            var logStream=PassThrough();
            logStream.on('data', function(data) {
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

 /**
 * Allocates action container for specified action from a local pool
 *
 * 1. Attempts to find free running container
 * 2. In case there no free running containers attempts to start stopped (cold) container
 * 3. If there no free stopped container new action container created 
 *
 * In 2 and 3 validates capacity contraints and throws error on failure
 * @param {String} actionName
 * @param {String} actionKind
 * @param {String} actionImage
 * @return {Promise} promise
 */
  getActionContainer(actionName, actionKind, actionImage){
    const hostCapacity = config.host_capacity; // maximum amount of action containers that we can run
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

        console.debug("checking if didn't reach full capacity: " + activeContainersNum + "<" + hostCapacity * that.nodesNumber);
        if(activeContainersNum >= hostCapacity * that.nodesNumber){
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

          that._startContainer(actionContainers[0]).then(function(){
            actionContainers[0].state = STATE.allocated;
            resolve(actionContainers[0]);
          });
        }else{
          // no free container, creating a new one
          // Reserving the entry in cash to release lock asap
          var actionContainer = {state: STATE.reserved, used: process.hrtime()[0], actionName};
          that.containers[actionName].push(actionContainer);
          release();

          that._createContainer(actionName, actionKind, actionImage).then((container)=>{
            actionContainer.container = container;
            actionContainer.kind = actionKind;
            
            that._startContainer(actionContainer).then(function(){
              actionContainer.state = STATE.allocated;
              console.debug("address: " + actionContainer.address);
              resolve(actionContainer);
            });
          });
        }
      });
    });
  }

  /**
  * Pulls docker image from docker hub in case of blackbox action kind
  *
  * @param {String} actionName
  * @param {String} kind
  * @param {String} image
  * @return {Promise} promise
  */
  fetch(actionName, kind, image){
    // TODO: add validations that action image exists
    var that = this;
    return new Promise((resolve, reject) => {
      if(!that.containers[actionName]){
        that.containers[actionName] = [];
      }

      // deprecate containers
      _.each(that.containers[actionName], function(actionContainer){
        actionContainer.state = STATE.deprecated;

        actionContainer.container.stop(function(){
          actionContainer.container.remove(function(){
            const containerArray = that.containers[actionName];
            containerArray.splice(containerArray.indexOf(actionContainer), 1);
          });
        });

      });

      if(kind == "blackbox" && config.blackbox_auto_pull == 'true'){
        console.log("pulling image " + image);
        that.docker.pull(image, function(err, stream){
          if(err){
            console.error("Error pulling docker image: " + JSON.stringify(err));
            return reject(err);
          }

          that.docker.modem.followProgress(stream, (err, output) => {
            if(err){
              console.error("Error pulling docker image: " + JSON.stringify(err));
              return reject(err);
            }else{
              console.debug("pull finished: " + JSON.stringify(output));
              return resolve();
            }
          });
        });
      }else{
        console.debug("action resources fetched: " + actionName);
        return resolve();
      }
    });
  };

  _createContainer(actionName, actionKind, actionImage){
    var that = this;
    var image = actionImage || actionKind.replace(":", "") + "action";
    return new Promise((resolve, reject) => {
      that.docker.createContainer({
        Tty: true, Image: image,
        NetworkMode: that.nwName, 'HostConfig': {NetworkMode: that.nwName},
        Env: ["__OW_API_HOST="+"http://"+this.myIP+":"+config.owl_port],
        Labels: {"action": actionName}},
        function (err, container) {
          if(err){
            console.error("error creating container:  " + JSON.stringify(err));
            return reject(err);
          }else{
            console.debug("container created: " + JSON.stringify(container));
            return resolve(container);
          }
        }
      );
    });
  };

}

module.exports = DockerBackend;
