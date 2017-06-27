const logger = require('winston');

logger.add(logger.transports.File, { filename: 'owl.log' });
console.error=logger.error;
console.log=logger.info;
console.info=logger.info;
console.debug=logger.debug;
console.warn=logger.warn;

logger.level = process.env.OWL_LOG_LEVEL || 'debug';


module.exports = {
  total_capacity: process.env.OWL_TOTAL_CAPACITY || 5,
  preemption: {
    enabled: false,
    period: 10,
    high_percent: 0.75,
    low_percent: 0.25,
    factors: {
      // default is 1
      "java": 3,
      "blackbox": 5
    },
  },
  retries: { // when there is no free capacity, how long should we retry
	  timeout: process.env.OWL_TIMEOUT || 100, // in msec
	  number: process.env.OWL_RETRIES || 1000
  },
  delegate_on_failure:  process.env.OWL_DELEGATE_ON_FAILURE || false
};
