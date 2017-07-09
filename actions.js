const DockerBackend = require('./dockerbackend'),
      DockerBackendWithPreemption = require('./dockerBackendWithPreemption'),
      messages = require('./messages'),
      config = require("./config"),
      url = require('url'),
      activations = require('./activations'),
      retry = require('retry-as-promised'),
      actionproxy = require('./actionproxy'),
      STATE = require('./utils').STATE,
      owproxy = require('./owproxy'),
      
      dockerhost = config.docker_host,
      backend = (config.preemption && config.preemption.enabled == 'true') ?
                new DockerBackendWithPreemption({dockerurl: dockerhost}) :
                new DockerBackend({dockerurl: dockerhost}),


      retryOptions = {
        max: config.retries.number, 
        timeout: 60000, // TODO: use action time limit?
        match: [ 
          messages.TOTAL_CAPACITY_LIMIT
        ],
        backoffBase: config.retries.timeout,
        backoffExponent: 1, 
        report: function(msg){ console.log(msg, ""); }, 
        name:  'Action invoke' 
      },

      //e.g. { $ACTION_NAME: "exec": { "kind": "nodejs", "code": "function main(params) {}" .... },}
      actions = {};

console.debug("dockerhost: " + dockerhost);

 /**
 * Invokes action in Openwhisk light platform
 *
 * Code flow:
 *
 * Get action from local repository
 *   if not exist, get from ownext and update local repository
 *
 *  Retry Allocate container
 *    if failed:
 *      ownext.invoke
 *
 *  activations.create
 *    if not blocking respond with result
 *
 *  actionProxy.invoke
 *   update activation
 *
 *  if blocking
 *    respond with result
 *
 * @param {Object} req
 * @param {Object} res
 */
function handleInvokeAction(req, res) {
  var start = new Date().getTime();
  var api_key = _from_auth_header(req);

  function respond(result, err){
    console.log("responding with " + result);
	var rc = err ? 502 : 200;
	var response = _buildResponse(result, err);
	res.status(rc).send(response.result);
  }

  function updateAndRespond(actionContainer, activation, result, err) {
    var rc = err ? 502 : 200;
	var response = _buildResponse(result, err);

    if(!activation){
      if(req.query.blocking === "true") {
        console.debug("returning result: " + response.result);
        res.status(rc).send(response.result);
      }
      console.debug("returning");
      return;
    }

	activations.getActivation(activation.activationId).then(function(activationDoc) {
      console.debug('updating activation: ' + JSON.stringify(activationDoc));
      var end = new Date().getTime();
	  activationDoc.activation.end = end;
      activationDoc.activation.duration = (end - activationDoc.activation.start);
      activationDoc.activation.response = response;
      activationDoc.activation.logs = actionContainer.logs || [];

	  //store activation 
	  activations.updateActivation(activationDoc).then(function (doc) {
	    console.debug("returned response: " + JSON.stringify(doc));
        if (req.query.blocking === "true") {
          console.debug("responding: " + JSON.stringify(response));

          if(req.query.result === "true") {
		    res.status(rc).send(response.result);
		  } else {
		    res.status(rc).send(activationDoc.activation);
		  }
        }
	  }).catch(function (err) {
        _processErr(req, res, err);
      });
    }).catch(function (err) {
      _processErr(req, res, err);
    });
  }

  _getAction(req).then((action) => {
    retry(function () { return backend.getActionContainer(req.params.actionName, action.exec.kind, action.exec.image) }, retryOptions).then((actionContainer) => {
      _createActivationAndRespond(req, res, start).then((activation) => {
        console.debug("container allocated");
        if(config.db_strategy == 'test'){
            backend.invalidateContainer(actionContainer);
            return respond({test: 'test'});
        }
        actionproxy.init(action, actionContainer).then(() => {
          console.debug("container initialized");
          
          if(config.db_strategy == 'test1'){
            backend.invalidateContainer(actionContainer);
            return respond({test: 'test1'});
          }

          var params = req.body;
          console.log("req.body: " + JSON.stringify(req.body));
          action.parameters.forEach(function(param) { params[param.key]=param.value; });
          if(config.db_strategy == 'test2'){
            backend.invalidateContainer(actionContainer);
            return respond({test: 'test2'});
          }

          console.debug("invoking action on container with params: " + JSON.stringify(params));
		  actionproxy.run(actionContainer, api_key, params).then(function(result){
            console.debug("invoke request returned with " + JSON.stringify(result));
            backend.invalidateContainer(actionContainer);
            updateAndRespond(actionContainer, activation, result);
            return;
          }).catch(function(err){
            console.error("invoke request failed with " + err);
            backend.invalidateContainer(actionContainer);
            updateAndRespond(actionContainer, activation, {}, err);
          });					
        }).catch(function(err){
          console.error("container init failed with " + err);
          backend.invalidateContainer(actionContainer);
          updateAndRespond(actionContainer, activation, {}, err);
        });
      }).catch(function (err) {
        _processErr(req, res, err);
      });
    }).catch(function (e) {
      console.error("retry failed to get action container from backend: " + e);
      if (e != messages.TOTAL_CAPACITY_LIMIT) {
        _processErr(req, res, e);
      } else {
        if (config.delegate_on_failure == 'true') {
            console.log("delegating action invoke to bursting ow service");
            // return owproxy.proxy(req, res); // can be changed to this single line once the "Error: write after end" bug resolved
            owproxy.invoke(req).then(function (result) {
            console.debug("delegated invoke returned result: " + JSON.stringify(result));
            respond(result);
          }).catch(function (e) {
            console.error("delegated invoke failed: " + JSON.stringify(e));
            respond({}, e);
          });
        } else {
          console.error("capacity limit reached");
		  respond({}, e);
        }
      }
	});
  }).catch(function (err) {
    _processErr(req, res, err);
  });
}

/**
 * Action get name. Also currently used to update openwhisk local actions registry
 * 
 * Get action from openwhisk global
 * Update local actions registry
 * Update bursting service actions registry
 * @param {Object} req
 * @param {Object} res
 */
function handleGetAction(req, res) {
  var start = new Date().getTime();
  _getAction(req, true).then((action) => {
    res.send(action);
  }).catch((err)=>{
    console.error("action get error: " + err);
    _processErr(req, res, err);
  });
}

/**
 * Delegate action delete to openwhisk next
 * 
 * delete action from local registry
 * delete action from bursting service
 * @param {Object} req
 * @param {Object} res
 */
function handleDeleteAction(req, res) {
  var api_key = _from_auth_header(req);
  var start = new Date().getTime();

  owproxy.deleteAction(req).then(function (result) {
	delete actions[req.params.actionName];
	res.send(result);
  }).catch(function (e) {
	console.error(JSON.stringify(e));
	_processErr(req, res, e);
  });
}

/**
 * - delegate action update to openwhisk next
 * - update action in local registry
 * @param {Object} req
 * @param {Object} res
 */
function handleUpdateAction(req, res) {
  owproxy.updateAction(req).then(function (result) {
    console.debug("action update result: " + JSON.stringify(result));
    _updateAction(req, result).then(()=>{
      console.debug("action updated");
      res.send(result); 
    });
  }).catch(function (e) {
    console.error(JSON.stringify(e));
    _processErr(req, res, e);
  });
}

function _from_auth_header(req) {
  var auth = req.get("authorization");
  auth = auth.replace(/basic /i, "");
  auth = new Buffer(auth, 'base64').toString('ascii');
  return auth;
}

function _auth_match(action, auth){
  return action.api_key == auth.replace(/basic /i, "");
}

function _updateAction(req, action){
  var that = this;
  return new Promise(function (resolve, reject) {
    backend.fetch(req.params.actionName, action.exec.kind, action.exec.image).then((result) => {
      console.debug("action " + req.params.actionName + " registered");
      action.api_key = req.get("authorization").replace(/basic /i, "");
      actions[req.params.actionName] = action;

      console.debug("Registered actions ==> " + JSON.stringify(actions));
      resolve();
    }).catch(function (e) {
      console.error("Error fetching an action: " + e);
      reject(e);
    });
  });
}

/**
 * Get action from local cashe.
 *
 * In case action missing in local cashe request action from openwhisk next and update local cashe
 * 
 * delete action from local registry
 * delete action from bursting service
 * @param {Object} req
 * @param {Boolean} fetch - if specified will explicitly update local cache with action from remote
 */
function _getAction(req, fetch) {
  var that = this;
  return new Promise(function (resolve, reject) {
	var action = actions[req.params.actionName];
	if (!fetch && action && _auth_match(action, req.get("authorization"))){
      resolve(action);
	} else {
	  //no cached action, throwing ACTION MISSING error so the caller will know it needs to be created
	  console.debug("getting action " + req.params.actionName + " from owproxy");
	  owproxy.getAction(req).then((action) => {
        if(actions[req.params.actionName] && action.version == actions[req.params.actionName].version){
          console.debug("version of the resolved action identical to cached one: " + action.version + ", no need to update local cache");
          resolve(action);
        }

        _updateAction(req, action).then(() => {
          console.debug("Registered actions ==> " + JSON.stringify(actions));
          resolve(action);
        }).catch(function (e) {
          console.error("Error registering action: " + e);
          reject(e);
        });
      }).catch(function (e) {
        console.log("Error getting action: " + e);
		reject(e);
	  });
	}
  });
}

function _createActivationAndRespond(req, res, start){
  return new Promise(function(resolve,reject) {
    activations.createActivation(req.params.namespace, req.params.actionName, start).then(function (activation) {
	  console.debug("create activation response: " + JSON.stringify(activation));
		
	  // if not blocking respond with activation id and continue with the flow
      if(req.query.blocking !== "true"){
	    console.debug("returning activation: " + activation ? activation : "");
        res.send(activation ? activation : "");
      }		   
	  resolve(activation);
    }).catch(function (err) {
      console.log(err);
      reject(err);
	});
  });
}

function _buildResponse(result, err){
  var response;

  if (err !== undefined) {
    var msg = _getErrorMessage(err);
    console.debug("error message: " + JSON.stringify(msg));
    response = {
      "result": {
        error: msg
      },
      "status": "action developer error",
      "success": false
    };
  } else {
    response = {
      result,
      "status": "success",
      "success": true
    };
  }

  console.log("builded response: " + JSON.stringify(response));
  return response;
}

function _processErr(req, res, err){
  if(err.name && err.statusCode){
    res.send(err);
  }else{
    var msg = _getErrorMessage(err);

    err.stack && console.error(err.stack) || console.error("error occured: " + msg);
         
    res.status(404).send({
      error: msg,
      code: -1
    });
  }
}

function _getErrorMessage(error){
    return error ? (error.error ? (error.error.error ? error.error.error : error.error) : error) : "";
}

module.exports = {
  handleInvokeAction:handleInvokeAction, 
  handleDeleteAction:handleDeleteAction, 
  handleGetAction:handleGetAction,
  handleUpdateAction
};

