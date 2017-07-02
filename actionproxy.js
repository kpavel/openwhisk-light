// This module captures all the functions interacting with the action proxy code running within action containers
const utils = require('./utils'),
      validator = require('validator'),
      messages = require('./messages'),
      config = require("./config"); 

/**
 * Initilizes action container
 *
 * returns promise resolved when action container completes initialization and ready to run actions
 * rejects messages.INIT_TIMEOUT_ERROR in case initialization not completed on time
 *
 * @param {Object} action
 * @param {Object} actionContainer
 * @return {Promise} promise
 */
function init(action, actionContainer) {
  return new Promise((resolve, reject) => {
    actionContainer.logs = [];

    if(actionContainer.inited){
      resolve();
    }
    
    var payload;
    if(action.exec.kind == "java"){
      payload = {value: { main: action.exec.main, jar: action.exec.code, code: action.exec.code}};
    }else{
      payload = {value: { main: "main", code: action.exec.code}};
    }
    
    if(action.exec.code && validator.isBase64(action.exec.code)){
      payload.value['binary'] = true;
    }

    const RETRY_TIMEOUT = 100; // in msec
    var retries = config.init_timeout * 1000 / RETRY_TIMEOUT
    var waitToInit = function(){
      if(--retries == 0){
        console.error("failed to initialize container, " + messages.INIT_TIMEOUT_ERROR);
        return reject(messages.INIT_TIMEOUT_ERROR);
      }

      utils.request("POST", "http://" + actionContainer.address + ":8080/init", payload).then((result) =>{
        if(!result.OK && result != "OK"){
          console.debug(JSON.stringify(result) + " is not OK");

          container.top({ps_args: 'aux'}, function(err, data) {
            if(err){
              console.error("container top returned an error: " + JSON.stringify(err));
              return reject(err);
            }
          });

          setTimeout(waitToInit, RETRY_TIMEOUT);
        }else{
          console.debug("Container inited!");
          Object.assign(actionContainer, {'used': process.hrtime()[0], inited: true});
          return resolve();
        }
      }).catch(err => {
        console.debug("Error initing container, retrying: " + err);
        setTimeout(waitToInit, RETRY_TIMEOUT);
      });
    };

    waitToInit();
  });
}

/**
 * Runs action inside action container
 *
 * returns promise resolved with result of action invocation
 *
 * @param {Object} actionContainer
 * @param {String} api_key
 * @param {Object} params
 * @return {Promise} promise
 */
function run(actionContainer, api_key, params) {
  return utils.request("POST", "http://" + actionContainer.address + ":8080/run", {"value": params, "api_key": api_key, "action_name": actionContainer.actionName, "namespace": "_"});
}

module.exports = {init:init, run:run};
