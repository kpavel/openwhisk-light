module.exports = {
  total_capacity: 5,
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
	  timeout: 5000, //msec
	  number: 10
  },
  delegate_on_failure: false,
  url_path_prefix: '/api/v1'
};
