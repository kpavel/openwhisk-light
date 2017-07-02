const request = require('request'),
      openwhisk = require('openwhisk'),
      utils = require('./utils'),
      config = require("./config"), // configuration settings

      nextOpenwhiskHost = config.backend_openwhisk,
      url_path_prefix = config.url_path_prefix || '/api/v1',
      nextOpenwhiskApi = nextOpenwhiskHost + url_path_prefix

console.debug("OWL_NEXT_OPENWHISK_HOST: " + nextOpenwhiskHost);

module.exports = {

  proxy: function proxy(req, res) {
    var url = nextOpenwhiskHost + req.originalUrl;
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
    return utils.request("POST", nextOpenwhiskApi + req.url, req.body, {"authorization": req.get("authorization")});
  },

  getAction: function getAction(req) {
    var api_key = from_auth_header(req);
    var ow_client = openwhisk({ api: nextOpenwhiskApi, api_key });
    return ow_client.actions.get({actionName: req.params.actionName, namespace: req.params.namespace});
  },

  deleteAction: function deleteAction(req){
    return utils.request("DELETE", nextOpenwhiskApi + req.path, req.body, {"authorization": req.get("authorization")});
  }
};

function from_auth_header(req) {
  var auth = req.get("authorization");
  auth = auth.replace(/basic /i, "");
  auth = new Buffer(auth, 'base64').toString('ascii');
  return auth;
}

