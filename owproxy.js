var request = require('request'),
  utils = require('./utils'),
  openwhisk = require('openwhisk');


const config = require("./config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option

var openwhiskHost = process.env.OPENWHISK_HOST || function () {
  throw "please set the OPENWHISK_HOST environmental variable pointing to openwhisk global, e.g. https://openwhisk.ng.bluemix.net";
}();

var openwhiskApi = process.env.OPENWHISK_API || function () {
  throw "please set the OPENWHISK_API environmental variable pointing to openwhisk global, e.g. https://openwhisk.ng.bluemix.net/api/v1";
}();

console.log("OPENWHISK_HOST: " + openwhiskHost);

//var stringify = require('json-stringify-safe');

/*
 * Proxy to global openwhisk specified by OPENWHISK_HOST environment variable
 */
module.exports = {

  proxy: function proxy(req, res) {
    var url = openwhiskHost + req.originalUrl;
    console.log("url: " + url);
    console.log("delegating " + req.method + " to " + url);

    var r = null;
    if (req.method === 'POST') {
      req.pipe(request.post({ uri: url, json: req.body }), { end: false }).pipe(res);
    } if (req.method === 'PUT') {
      req.pipe(request.put({ uri: url, json: req.body }), { end: false }).pipe(res);
    } else {
      req.pipe(request(url)).pipe(res);
    }
  },

  // TODO: consider to use proxy instead. it will save the response handling in caller
  invoke: function invoke(req) {
    return utils.request("POST", openwhiskApi + req.path, req.body);
  },

  getAction: function getAction(req) {
    var api_key = from_auth_header(req);
    var ow_client = openwhisk({ api: openwhiskApi, api_key });
    return ow_client.actions.get({actionName: req.params.actionName, namespace: req.params.namespace});
  },

  deleteAction: function deleteAction(req){
    return utils.request("DELETE", openwhiskApi + req.path, req.body, {"authorization": req.get("authorization")});
  }
};

function from_auth_header(req) {
  var auth = req.get("authorization");
  auth = auth.replace(/basic /i, "");
  auth = new Buffer(auth, 'base64').toString('ascii');
  return auth;
}
