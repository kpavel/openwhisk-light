const owproxy = require('./owproxy.js'),
      uuid = require("uuid"),
      _ = require("underscore"),
      config = require("./config.js");

switch (config.db_strategy) {
  case 'disk':
    console.log('disk database strategy chosen');
    var PouchDB = require('pouchdb');
    PouchDB.plugin(require('pouchdb-find'));
    var db = new PouchDB(config.db_name);
    break;
  case 'memory':
    console.log('memory database strategy chosen');
    var PouchDB = require('pouchdb');
    PouchDB.plugin(require('pouchdb-find'));
    PouchDB.plugin(require('pouchdb-adapter-memory'));
    var db = new PouchDB(config.db_name, {adapter: 'memory'});
    break;
  case 'disable':
    console.log('database disabled');
    break;
  default:
    var msg = 'unsupported database strategy chosen' + config.db_strategy + '.';
    console.error(msg);
    throw msg; 
}


db && db.createIndex({
  index: {fields: ['activation.start']}
}).then((res)=>{console.debug("indexing res: " + JSON.stringify(res));}).catch((err)=>{console.error("indexing error: " + err)});

/**
 * Gets all activations from local cache and sends result
 *
 * @param {Object} req
 * @param {Object} res
 */
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

/**
 * Gets activation from local cache and sends result
 *
 * If activation not found delegates request to openwhisk next
 * @param {Object} req
 * @param {Object} res
 */
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

/**
 * Gets activation logs from local cache and sends result
 *
 * If activation not found delegates request to openwhisk next
 * @param {Object} req
 * @param {Object} res
 */
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

/**
 * Gets activation result from local cache and sends result
 *
 * If activation not found delegates request to openwhisk next
 * @param {Object} req
 * @param {Object} res
 */
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

/**
 * Creates activation in local cache
 *
 * @param {Object} activationDoc
 * @return {Object} activationDoc
 */
function createActivation(namespace, name) {
  var activationId = uuid.v4();
  var activation = {
    activationId,
    "logs": [],
    name,
    namespace,
    "publish": false,
    start,
    "subject": "owl@il.ibm.com",
    "version": "0.0.0"
  }

  return new Promise((resolve,reject)=>{
    db.put({_id:activation.activationId, activation}).then((result)=>{
      if(result.ok){
        resolve(activation);
      }else{
        reject(result);
      }
    });
  });
}

/**
 * Updates activation in local cache
 *
 * @param {Object} activationDoc
 * @return {Object} activationDoc
 */
function updateActivation(activationDoc) {
  return db.put(activationDoc);
}

/**
 * Returns activation from local cache
 *
 * @param {Object} activationId
 * @return {Object} activationDoc
 */
function getActivation(activationId) {
  return db.get(activationId);
}

module.exports = {
  handleGetActivations: db ? handleGetActivations : owproxy.proxy, 
  handleGetActivation: db ? handleGetActivation : owproxy.proxy,
  handleGetActivationLogs: db ? handleGetActivationLogs : owproxy.proxy,
  handleGetActivationResult: db ? handleGetActivationResult : owproxy.proxy,
  createActivation: db ? createActivation : (o)=>{/* do nothing */ return Promise.resolve()},
  updateActivation: db ? updateActivation : (o)=>{/* do nothing */ return Promise.resolve()},
  getActivation: db ? getActivation : (o)=>{return Promise.resolve()}  
};

