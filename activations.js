const owproxy = require('./owproxy.js'),
      PouchDB = require('pouchdb'),
      db = new PouchDB('owl.db'),
      _ = require("underscore");

PouchDB.plugin(require('pouchdb-find'));

db.createIndex({
  index: {fields: ['activation.start']}
}).then((res)=>{console.debug("indexing res: " + JSON.stringify(res));}).catch((err)=>{console.error("indexing error: " + err)});


function handleGetActivations(req, res) {
	console.debug("------in activations list with " + req.originalUrl);
	
	db.find({
	  selector: {
	    'activation.start': {$gte: null}
	  },
	  sort: [{'activation.start': 'desc'}]
	}).then((result)=>{
		console.debug("find response: " + JSON.stringify(result));
		result = _.pluck(result.docs, 'activation');
        console.debug("res after pluck: " + JSON.stringify(result));
        res.send(result);
	}).catch((err)=>{console.error("find error: " + err)});	
}

function handleGetActivation(req, res) {
	console.debug("in activations get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.debug("res: " + JSON.stringify(result));
        res.send(result.activation);
    }).catch(function (err) {
        console.log(err);
        console.log("Delegating activation get to proxy");
        owproxy.proxy(req, res);
    });
}

function handleGetActivationLogs(req, res) {
	console.debug("in activations logs get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.debug("res: " + JSON.stringify(result));
        res.send({logs: result.activation.logs});
    }).catch(function (err) {
        console.log(err);
        console.log("Delegating activation logs get to proxy");
        owproxy.proxy(req, res);
    });	
}

function handleGetActivationResult(req, res) {
	console.debug("in activations result get with " + req.originalUrl);
	  
	db.get(req.params.activationid).then(function (result) {
        console.debug("res: " + JSON.stringify(result));
        res.send(result.activation.response);
    }).catch(function (err) {
        console.log(err);
        console.log("Delegating activation get result to proxy");
        owproxy.proxy(req, res);
    });	
}

function createActivation(activationDoc) {
  return db.put({_id:activationDoc.activationId, activation:activationDoc});
}

function updateActivation(activationDoc) {
  return db.put(activationDoc);
}

function getActivation(activationId) {
  return db.get(activationId);
}

module.exports = {
  handleGetActivations:handleGetActivations, 
  handleGetActivation:handleGetActivation,
  handleGetActivationLogs:handleGetActivationLogs,
  handleGetActivationResult:handleGetActivationResult,
  createActivation:createActivation,
  updateActivation:updateActivation,
  getActivation:getActivation
};

