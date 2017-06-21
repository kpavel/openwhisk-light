const DockerBackend = require('./dockerbackend.js');
const messages = require('./messages');

var cron = require("cron");
var _ = require("underscore");

const config = require("./config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option
const totalCapacity = config.total_capacity || 8; // max number of containers per host
const STATE    = require('./utils').STATE;

class DockerBackendWithPreemption extends DockerBackend {

  constructor (options) {
    super(options);
    this.start_preemption();
  }

  start_preemption(){
    const that = this;

    const preeemptionPeriod = config.preemption.period || 300;     // how often to check whether containers should be stopped
    const preemption_high_percent = config.preemption.high_percent || 0.75;
    const preemption_low_percent = config.preemption.low_percent || 0.25;

    const preemptionHighThresholdPerHost = totalCapacity * preemption_high_percent;  // indicates when preeption should be started (75% of max amount)
    const preemptionLowThresholdPerHost = totalCapacity * preemption_low_percent;    // low and high thresholds define an optimal window of containers performace and host utilization balance

    const factors = config.preemption.factors || {}; // preemption factor per image type, e.g. java/blackbox container may take more time to start than js one

    //TODO: rename
    const containerCleanup = config.preemption.container_cleanup || 300; //seconds to wait until removing idle containers even if below watermark

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
            var activeContainersNum = 0;
            for(var key in that.containers){
              activeContainers = activeContainers.concat(_.filter(that.containers[key], (o) => {
                return (o.state != STATE.stopped);
              }));

              //  TODO: move inactive containers handling to separate cron job
              inactiveContainers = inactiveContainers.concat(_.filter(that.containers[key], (o) => {
                return ((currentTime - o.used) > containerCleanup);
              }));
            }

            console.log("activeContainers length: " + activeContainers.length);
            if(activeContainers.length >= nodes * preemptionHighThresholdPerHost){
              console.log("-starting premption as activeContainers number greater than " + nodes * preemptionHighThresholdPerHost);

              // sort active containers by (currentTime - last invoked hrtime) * factor
              var sortedContainers = _.sortBy(activeContainers, function(o){
                var factor = factors[o.kind] || 1;
                return ((currentTime - o.used) / factor);
              }).reverse();

              console.log("-need to stop " + (sortedContainers.length - Math.floor(nodes * preemptionLowThresholdPerHost)) + " from " + sortedContainers.length);
              sortedContainers = sortedContainers.slice(0, sortedContainers.length - Math.floor(nodes * preemptionLowThresholdPerHost));

              var fnStop = function stop(containerInfo){
                return new Promise((resolve) => {
                  containerInfo.container.stop(function(data){
                    containerInfo['state'] = STATE.stopped;
                    delete containerInfo['inited'];
                    delete containerInfo['address'];
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
}

module.exports = DockerBackendWithPreemption;
