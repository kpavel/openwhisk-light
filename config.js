const logger = require('winston');

logger.add(logger.transports.File, { filename: 'owl.log' });
console.error=logger.error;
console.log=logger.info;
console.info=logger.info;
console.debug=logger.debug;
console.warn=logger.warn;

logger.level = process.env.LOG_LEVEL || 'debug';


module.exports = {
  total_capacity: process.env.TOTAL_CAPACITY || 5,
  preemption: {
    enabled: false,
    period: 10,
    high_percent: 0.75,
    low_percent: 0.25,
    factors: {
      "nodejs": 1,
      "nodejs:6": 1,
      "java": 3,
      "blackbox": 5
    },
  },
  retries: {
	  timeout: 2000, //msec
	  number: process.env.RETRIES || 3 
  },
  delegate_on_failure:  process.env.DELEGATE_ON_FAILURE || false
};
