// This module captures all the functions interacting with the action proxy code running within action containers
const utils = require('./utils'),
      validator = require('validator'),
      config = require("./config.js") || {}, // holds node specific settings, consider to use another file, e.g. config.js as option
      initTimeout = config.init_timeout || 10000; // action container init timeout in milliseconds

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

    const RETRY_TIMEOUT = 100;
    var retries = initTimeout / RETRY_TIMEOUT
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
 
function run(actionContainer, api_key, params) {
  return utils.request("POST", "http://" + actionContainer.address + ":8080/run", {"value": params, "api_key": api_key, "action_name": actionContainer.actionName, "namespace": "_"});
}

module.exports = {init:init, run:run};
