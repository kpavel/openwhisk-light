var express = require('express');
var router = express.Router({strict: true});
var bodyParser = require('body-parser');

const actions = require('./actions.js');
const activations = require('./activations.js');
const owproxy = require('./owproxy.js');

router.use(bodyParser.json({limit:'10mb'}));

// ===== ACTIONS =====
router.post('/namespaces/:namespace/actions/:actionName', invokeHandler);
router.post('/namespaces/:namespace/actions/:packageName/:actionName', invokeHandlerWithPackage);

function invokeHandlerWithPackage(req, res) {
  // concatenate /<namespace>/<packageName>/<actionName> and pass as action name
  req.params.actionName = '/' + req.params.namespace + '/' + req.params.packageName + '/' + req.params.actionName;
  invokeHandler(req, res);
}

function invokeHandler(req, res) {
  actions.handleInvokeAction(req, res);
}

router.get('/namespaces/:namespace/actions/:actionName', getHandler);
router.get('/namespaces/:namespace/actions/:packageName/:actionName', getHandlerWithPackage);

function getHandlerWithPackage(req, res) {
  // concatenate /<namespace>/<packageName>/<actionName> and pass as action name
  req.params.actionName = '/' + req.params.namespace + '/' + req.params.packageName + '/' + req.params.actionName;
  getHandler(req, res);
}

function getHandler(req, res) {
  actions.handleGetAction(req, res);
}

router.delete('/namespaces/:namespace/actions/:actionName', deleteHandler);
router.delete('/namespaces/:namespace/actions/:packageName/:actionName', deleteHandlerWithPackage);

function deleteHandlerWithPackage(req, res) {
  // concatenate /<namespace>/<packageName>/<actionName> and pass as action name
  req.params.actionName = '/' + req.params.namespace + '/' + req.params.packageName + '/' + req.params.actionName;
  deleteHandler(req, res);
}

function deleteHandler(req, res) {
  actions.handleDeleteAction(req, res);
}

// ===== ACTIVATIONS =====
router.get('/namespaces/:namespace/activations', function(req, res) {
  activations.handleGetActivations(req, res);
});

router.get('/namespaces/:namespace/activations/:activationid', function(req, res) {
  activations.handleGetActivation(req, res);
});

router.get('/namespaces/:namespace/activations/:activationid/logs', function(req, res) {
  activations.handleGetActivationLogs(req, res);
});

router.get('/namespaces/:namespace/activations/:activationid/result', function(req, res) {
  activations.handleGetActivationResult(req, res);
});

// ===== PROXY =====
router.use('*', function(req, res) {
  owproxy.proxy(req, res);
});

module.exports = router;
