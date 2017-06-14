module.exports = {
  preeemptionPeriod: 10,
  totalCapacity: 5,
  preemption_high_percent: 0.75,
  preemption_low_percent: 0.25,
  factors: {
    "nodejs": 1,
    "nodejs:6": 1,
    "java": 3,
    "blackbox": 5
  },
  retries: {
	  timeout: 5000, //msec
	  number: 10
  },
  delegate_on_failure: false
};
