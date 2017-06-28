const express = require('express'),
      router = express.Router({strict: true}),
      bodyParser = require('body-parser'),
      actions = require('./actions.js'),
      activations = require('./activations.js'),
      owproxy = require('./owproxy.js');

router.use(bodyParser.json({limit:'10mb'}));

// ===== ACTIONS =====
router.post('/namespaces/:namespace/actions/:actionName', invokeHandler);
router.post('/namespaces/:namespace/actions/:packageName/:actionName', invokeHandlerWithPackage);

function invokeHandlerWithPackage(req, res) {
  // concatenate /<namespace>/<packageName>/<actionName> and pass as action name
  req.params.actionName = req.params.packageName + '/' + req.params.actionName;
  console.log("invokehandler with " +  req.params.actionName);
  invokeHandler(req, res);
}

function invokeHandler(req, res) {
  req.params.actionName = '/' + req.params.namespace + '/' + req.params.actionName;
  actions.handleInvokeAction(req, res);
}

router.get('/namespaces/:namespace/actions/:actionName', getHandler);
router.get('/namespaces/:namespace/actions/:packageName/:actionName', getHandlerWithPackage);

function getHandlerWithPackage(req, res) {
  // concatenate /<namespace>/<packageName>/<actionName> and pass as action name
  req.params.actionName = req.params.packageName + '/' + req.params.actionName;
  getHandler(req, res);
}

function getHandler(req, res) {
  req.params.actionName = '/' + req.params.namespace + '/' + req.params.actionName;
  actions.handleGetAction(req, res);
}

router.delete('/namespaces/:namespace/actions/:actionName', deleteHandler);
router.delete('/namespaces/:namespace/actions/:packageName/:actionName', deleteHandlerWithPackage);

function deleteHandlerWithPackage(req, res) {
  // concatenate /<namespace>/<packageName>/<actionName> and pass as action name
  req.params.actionName = req.params.packageName + '/' + req.params.actionName;
  deleteHandler(req, res);
}

function deleteHandler(req, res) {
  req.params.actionName = '/' + req.params.namespace + '/' + req.params.actionName;
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
