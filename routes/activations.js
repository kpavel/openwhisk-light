var express = require('express');
var router = express.Router();
var openwhisk = require('openwhisk');
var bodyParser = require('body-parser');

const messages = require('./../messages');

const config = require("./../config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option


var PouchDB = require('pouchdb');
var db = new PouchDB('owl.db');
var _ = require("underscore");

var stringify = require('json-stringify-safe');

router.use(bodyParser.json());

// TODO
router.get('/namespaces/:namespace/activations', function(req, res) {
	console.log("REQ: " + stringify(req));
	console.log("------in activations list with " + req.originalUrl);
	
	db.allDocs({
		  include_docs: true,
		  limit: req.query.limit
		}).then(function (result) {
        console.log("res: " + JSON.stringify(result));
        
//        result = _.map(result.rows, function(activation){
//        	var doc = activation.doc;
//        	doc["version"] = doc._rev;
//        	
//        	doc["activationId"] = doc._id;
//        	
//        	doc = _.omit(doc, '_id', '_rev', 'subject', 'response');
//        	return doc;
//        });
        
        result = _.pluck(result.rows, 'doc');
        result = _.pluck(result, 'activation');
        console.log("res after pluck: " + JSON.stringify(result));
        res.send(result);
    }).catch(function (err) {
        console.log(err);
        res.status(502).send(buildResponse(req, start, {}, err));
    });	
});

router.get('/namespaces/:namespace/activations/:activationid', function(req, res) {
	console.log("in activations get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.log("res: " + JSON.stringify(result));
        res.send(result.activation);
    }).catch(function (err) {
        console.log(err);
        res.status(502).send(buildResponse(req, start, {}, err));
    });	
});

router.get('/namespaces/:namespace/activations/:activationid/logs', function(req, res) {
	console.log("in activations logs get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.log("res: " + JSON.stringify(result));
        res.send({logs: result.logs});
    }).catch(function (err) {
        console.log(err);
        res.status(502).send(buildResponse(req, start, {}, err));
    });	
});

router.get('/namespaces/:namespace/activations/:activationid/result', function(req, res) {
	console.log("in activations result get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.log("res: " + JSON.stringify(result));
        res.send(result.response);
    }).catch(function (err) {
        console.log(err);
        res.status(502).send(buildResponse(req, start, {}, err));
    });	
});

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
  
  
  
//  {
//	  "name": "hellonj",
//	  "activationId": "06986892a4b34065ab4bc3e38ba3bc06",
//	  "publish": false,
//	  "annotations": [{
//	    "key": "limits",
//	    "value": {
//	      "timeout": 120000,
//	      "memory": 256,
//	      "logs": 10
//	    }
//	  }, {
//	    "key": "path",
//	    "value": "kpavel@il.ibm.com_uspace/hellonj"
//	  }],
//	  "version": "0.0.11",
//	  "namespace": "kpavel@il.ibm.com_uspace"
//	}

  return {
    duration: (end - start),
    end,
    logs: [],
    name: req.params.actionName,
    namespace: req.params.namespace,
    "publish": false,
    response,
    start,
    "subject": "kpavel@il.ibm.com",
    "version": "0.0.4"
  }
}


module.exports = router;
