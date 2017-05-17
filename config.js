module.exports = {
  preeemptionPeriod: 150,
  totalCapacity: 5,
  preemption_high_percent: 0.75,
  preemption_low_percent: 0.25,
  factors: {
    "nodejs": 1,
    "nodejs:6": 1,
    "java": 3,
    "blackbox": 5
  }
};