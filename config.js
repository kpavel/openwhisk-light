const logger = require('winston');

logger.add(logger.transports.File, { filename: 'owl.log' });
console.log=logger.info;
console.debug=logger.debug;
console.info=logger.info;
console.warn=logger.warn;
console.error=logger.error;

logger.level = process.env.OWL_LOG_LEVEL || 'debug';


module.exports = {

  docker_host: process.env.DOCKER_HOST || function() {
        throw "please set the DOCKER_HOST environmental variable, e.g., tcp://localhost:2375";
      }(),
  docker_net_name: process.env.OWL_NET_NAME, // not needed if OWL is running in a container 
  owl_port: process.env.OWL_PORT || 3000,
  backend_openwhisk: process.env.OWL_NEXT_OPENWHISK_HOST || 'https://openwhisk.ng.bluemix.net',
  host_capacity: process.env.OWL_HOST_CAPACITY || 5,
  init_timeout : process.env.OWL_CONTAINER_INIT_TIMEOUT || 10, // seconds
  preemption: {
    enabled: process.env.OWL_PREEMPTION_ENABLED || 'false',
    period: process.env.OWL_PREEMPTION_PERIOD || 10, // seconds
    high_percent: process.env.OWL_PREEMPTION_HIGH_PERCENT || 0.75,
    low_percent: process.env.OWL_PREEMPTION_LOW_PERCENT || 0.25,
    idle_cleanup: 600, // seconds
    factors: {
      // default is 1
      "java": 3,
      "blackbox": 5
    },
  },
  retries: { // when there is no free capacity, how long should we retry
    timeout: process.env.OWL_RETRIES_TIMEOUT || 100, // in msec
    number: process.env.OWL_RETRIES_NUMBER || 1000
  },
  delegate_on_failure:  process.env.OWL_DELEGATE_ON_FAILURE || 'false',
  blackbox_auto_pull: process.env.OWL_BLACKBOX_AUTO_PULL || 'true'
};
