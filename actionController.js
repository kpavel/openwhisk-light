var openwhisk = require('openwhisk');

const DockerBackend = require('./dockerbackend.js');
const messages = require('./messages');
const utils = require('./utils');
const config = require("./config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option

var dockerhost = process.env.DOCKER_HOST || function() {
    throw "please set the DOCKER_HOST environmental variable, e.g. http://${MY_HOST_WITH_DOCKER_REST}:2375";
}();

var openwhiskApi = process.env.OPENWHISK_API || function() {
    throw "please set the OPENWHISK_API environmental variable pointing to openwhisk global, e.g. https://openwhisk.ng.bluemix.net/api/v1";
}();

console.log("DOCKERHOST: " + dockerhost);
console.log("OPENWHISK_API: " + openwhiskApi);

var backend = new DockerBackend({dockerurl: dockerhost});
var stringify = require('json-stringify-safe');

var url = require('url');

var PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));

var db = new PouchDB('owl.db');


var uuid = require("uuid");

const retry = require('retry-as-promised')

var retryOptions = {
  max: config.retries.number, 
  timeout: config.retries.timeout, 
  match: [ 
    messages.TOTAL_CAPACITY_LIMIT
  ],
  backoffBase: 15000,
  backoffExponent: 1, 
  report: function(msg){ console.log(msg, ""); }, 
  name:  'Action invoke' 
};

/*
 * OpenWhisk action invoke local implementation
 * 
 * Create activation in db
 * 		if not blocking respond with activation
 * 
 * Invoke action on openwhisk local Docker backend
 * 		if backend throws "action missing" exception
 * 			get specified action from global openwhisk
 * 			update local action registry
 * 			update bursting service action registry
 * 			invoke action on openwhisk local Docker backend and return result
 * 			if blocking
 * 				update activation
 * 
 * 		if backend throws "total capacity limit" exception
 * 			delegate action to bursting service
 * 			update activation
 * 			if blocking
 * 				respond with result
 * 	
 * 	update activation	
 * 	if blocking
 * 		respond with result
 * 
 */
function invokeAction(req, res) {
  console.log("PATH: " + req.path);
  console.log("params: " + JSON.stringify(req.params));
  console.log("namespace: " + req.params.namespace);
  console.log("actionName: " + req.params.actionName);

  console.log("BODY: " + JSON.stringify(req.body));
  console.log("headers: " + JSON.stringify(req.headers));

  var start = new Date().getTime();
  this["api_key"] = from_auth_header(req);
  console.log("API KEY: " + this.api_key);
  
  function updateAndRespond(activation, result, err){
	  console.log("raw result: " + JSON.stringify(result));
	  console.log("activation: " + JSON.stringify(activation));
	  var response;
	  var rc = 200;
	  
	  if(err !== undefined){
	    console.log("err.error.error:" + JSON.stringify(err));
	    response = {
	        "result": {
	             error: err.error.error
	        },
	        "status": "action developer error",
	        "success": false
	    };
	    rc = 502;
	  }else{
	    response = {
	        result,
	        "status": "success",
	        "success": true
	    };
	  }
	  
	  db.get(activation.activationId).then(function(activationDoc) {
              var end = new Date().getTime();
              activationDoc.activation.end = end;
              activationDoc.activation.duration = (end - activationDoc.activation.start);

              activationDoc.activation.response = response;
                  
	      
	      //store activation in local db
	      db.put(activationDoc).then(function (doc) {
	   	   console.log("returned responss: " + JSON.stringify(doc));
	   	   if(req.query.blocking === "true"){
	   		console.log("responding: " + JSON.stringify(response));
	   		
	   		if(req.query.result === "true"){
		   		res.status(rc).send(activationDoc.activation.response.result);
		   	}else{
		   		res.status(rc).send(activationDoc.activation);
		   	}
	   	   }
	      }).catch(function (err) {
	    	  processErr(req, res, err);
	      });
		}).catch(function (err) {
			processErr(req, res, err);
		});
    }
  
    createActivationAndRespond(req, res, start).then((activation) => {
			function invokeWithRetries(){
				console.log("starting invoke with retries");
					retry(function() {return backend.invoke(req.params.actionName, req.body, this.api_key)}, retryOptions).then((result)=>{
					console.log("=========>>>> retry resolved  " + result);
					updateAndRespond(activation, result);
				});
	  	}
	  
	  backend.invoke(req.params.actionName, req.body, this.api_key)
	    .then((result) => {
	    	updateAndRespond(activation, result);
	    })
	    .catch(function(e) {
	      if(e == messages.ACTION_MISSING_ERROR){
	        console.log("getting action " + req.params.actionName + " from " + openwhiskApi);
	        _getAction(req.params.namespace, req.params.actionName, req)
	        .then((action)=>{
                console.log("got action: " + JSON.stringify(action));
                console.log("Registering action under openwhisk edge " + JSON.stringify(action));

                backend.create(req.params.actionName, action)
                .then((result) => {
                   console.log("action " + req.params.actionName + " registered");
                   invokeWithRetries();
                })
                .catch(function(e) {
                  console.log("Error registering action: " + e);
                  updateAndRespond(activation, {}, e);
                })
	        }).catch(function (err) {
	        	updateAndRespond(activation, {}, err);
	        });
	      }else if(e == messages.TOTAL_CAPACITY_LIMIT){
	        console.log("Maximal local capacity reached.");

					invokeWithRetries().catch((e)=>{
						console.log("=========>>>> retry catched  " + e);
						if(e != messages.TOTAL_CAPACITY_LIMIT){
							processErr(req, res, e);
						}else{
							if(config.delegate_on_failure){
								console.log("Delegating action invoke to bursting ow service");
								utils.request("POST", OPENWHISK_API + req.path, req.body).then(function(result){
									console.log("--- RESULT: " + JSON.stringify(result));
									updateAndRespond(activation, result);
								}).catch(function(e) {
									console.log("--- ERROR: " + JSON.stringify(e));
									updateAndRespond(activation, {}, e);
								});
							}							
							updateAndRespond(activation, {}, e);
						}
					})
	      }else{
	    	  console.log("Unknown error occured");
	    	  updateAndRespond(activation, {}, e);
	      }
	    })
  })
  .catch(function (err) {
	  processErr(req, res, err);
  });
}

/*
 * Action get name. Also currently used to update openwhisk local actions registry
 * 
 * Get action from openwhisk global
 * Update local actions registry
 * Update bursting service actions registry
 */
function getAction(req, res) {
	console.log("BODY: " + JSON.stringify(req.body));
	var start = new Date().getTime();

	console.log("getting action " + req.params.actionName + " from " + openwhiskApi);
	_getAction(req.params.namespace, req.params.actionName, req)
	.then((action)=>{
	    console.log("got action: " + JSON.stringify(action));
	    console.log("Registering action under openwhisk edge " + JSON.stringify(action));

        backend.create(req.params.actionName, action)
        .then((result) => {
           console.log("action " + req.params.actionName + " registered");
         	 res.send(action);
        })
        .catch(function(e) {
          console.log(e);
          processErr(req, res, e);
        })
	})
	.catch(function (err) {
        console.log("action get error: " + err);
        processErr(req, res, err);
	});
}

/*
 * Delegate action delete to openwhisk global
 * 
 * delete action from local registry
 * delete action from bursting service
 */
function deleteAction(req, res) {
    var api_key = from_auth_header(req);
    var start = new Date().getTime();
    
    utils.request("DELETE", openwhiskApi + req.path, req.body, {"authorization": req.get("authorization")}).then(function(result){
      	backend.deleteAction(req.params.actionName);
        res.send(result);
    }).catch(function(e) {
        console.log("--- ERROR: " + JSON.stringify(e));
        processErr(req, res, e);
    });
}

function _getAction(namespace, actionName, req){
    var api_key = from_auth_header(req);
    var ow_client = openwhisk({api: openwhiskApi, api_key});

    return new Promise(function(resolve,reject) {
        ow_client.actions.get({actionName, namespace})
            .then(function (action) {
                console.log("Got action from " + openwhiskApi + ": " + JSON.stringify(action));
                resolve(action);
            })
            .catch((e) => {
                reject(e);
            });
    });
}

function from_auth_header(req) {
  var auth = req.get("authorization");
  auth = auth.replace(/basic /i, "");
  auth = new Buffer(auth, 'base64').toString('ascii');
  return auth;
}

function createActivationAndRespond(req, res, start){
	var activationId = uuid.v4();
	var activation = {
		activationId,
	    "logs": [],
	    name: req.params.actionName,
	    namespace: req.params.namespace,
	    "publish": false,
	    start,
	    "subject": "kpavel@il.ibm.com",
	    "version": "0.0.4"
    }
	
	console.log(1);
	return new Promise(function(resolve,reject) {
		console.log(2);
		
		console.log(activationId);
		console.log(stringify(activation));
		
		db.put({_id: activationId, activation}).then(function (response) {
			console.log(3);
			console.log("got db.post response: " + JSON.stringify(response));
		
			// if not blocking respond with activation id and continue with the flow
		   if(req.query.blocking !== "true"){
			   console.log("returning: " + JSON.stringify(activation));
			   res.send(activation);
		   }
		   
		   resolve(activation);
		   
		  }).catch(function (err) {
			  console.log(err);
			  reject(err);
		  });
	});
}

function buildResponse(req, start, result, error){
  var end = new Date().getTime();
  var response;
  if(error !== undefined){
    console.log("error.error.error: " + error.error.error);
    response = {
        "result": {
             error: error.error.error
        },
        "status": "action developer error",
        "success": false
    };
  }else{
	if(req.query.result === "true"){
		return result;
	}else{
	    response = {
	        result,
	        "status": "success",
	        "success": true
	    };
	}
  }

  return {
    duration: (end - start),
    end,
    "logs": [],
    name: req.params.actionName,
    namespace: req.params.namespace,
    "publish": false,
    response,
    start,
    "subject": "kpavel@il.ibm.com",
    "version": "0.0.4"
  }
}

function processErr(req, res, err){
	console.log(err);
//   	if(req.query.blocking === "true"){
   		console.log("err.error.error: " + err.error.error);
   		res.status(404).send({
   			error: err.error.error,
   			code: -1
   		});
//   	}
}
module.exports = {invokeAction:invokeAction, deleteAction:deleteAction, getAction:getAction};

