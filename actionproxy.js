// This module captures all the functions interacting with the action proxy code running within action containers
var utils = require('./utils');

function init(address, payload) {
  return utils.request("POST", "http://" + address + ":8080/init", payload );
}
 
function run(actionName, address, api_key, params) {
  return utils.request("POST", "http://" + address + ":8080/run", {"value": params, "api_key": api_key, "action_name": actionName, "namespace": "_"});
}

module.exports = {init:init, run:run};
