var openwhisk = require('openwhisk');

const messages = require('./messages');

const config = require("./config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option


var PouchDB = require('pouchdb');
var db = new PouchDB('owl.db');
var _ = require("underscore");

var stringify = require('json-stringify-safe');
PouchDB.plugin(require('pouchdb-find'));

db.createIndex({
  index: {fields: ['activation.start']}
}).then((res)=>{console.log("indexing res: " + JSON.stringify(res));}).catch((err)=>{console.log("indexing error: " + err)});


function getActivations(req, res) {
//	console.log("REQ: " + stringify(req));
	console.log("------in activations list with " + req.originalUrl);
	
	db.find({
	  selector: {
	    'activation.start': {$gte: null}
	  },
	  sort: [{'activation.start': 'desc'}]
	}).then((result)=>{
		console.log("find response: " + JSON.stringify(result));
		result = _.pluck(result.docs, 'activation');
        console.log("res after pluck: " + JSON.stringify(result));
        res.send(result);
	}).catch((err)=>{console.log("find error: " + err)});	
}

function getActivation(req, res) {
	console.log("in activations get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.log("res: " + JSON.stringify(result));
        res.send(result.activation);
    }).catch(function (err) {
        console.log(err);
        res.status(502).send(buildResponse(req, err));
    });	
}

function getActivationLogs(req, res) {
	console.log("in activations logs get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.log("res: " + JSON.stringify(result));
        res.send({logs: result.activation.logs});
    }).catch(function (err) {
        console.log(err);
        res.status(502).send(buildResponse(req, err));
    });	
}

function getActivationResult(req, res) {
	console.log("in activations result get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.log("res: " + JSON.stringify(result));
        res.send(result.activation.response);
    }).catch(function (err) {
        console.log(err);
        res.status(502).send(buildResponse(req, err));
    });	
}

function buildResponse(req, error){
    console.log("error.error.error: " + error.error.error);
    response = {
        "result": {
             error: error.error.error
        },
        "status": "action developer error",
        "success": false
    };

  return {
    name: req.params.actionName,
    namespace: req.params.namespace,
    "publish": false,
    response,
    "subject": "kpavel@il.ibm.com",
    "version": "0.0.4"
  }
}

module.exports = {
  getActivations:getActivations, 
  getActivation:getActivation,
  getActivationLogs:getActivationLogs,
  getActivationResult:getActivationResult};

