var express = require('express');
var router = express.Router();

const config = require("./../config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option

var openwhiskApi = process.env.OPENWHISK_API || function() {
    throw "please set the OPENWHISK_API environmental variable pointing to openwhisk global, e.g. https://openwhisk.ng.bluemix.net";
}();

console.log("OPENWHISK_API: " + openwhiskApi);

//var stringify = require('json-stringify-safe');

var request = require('request');

router.use('/namespaces/:namespace*', function(req, res) {
  console.log("in /namespaces/:namespace*");
  console.log("METHOD: " + req.method);
  console.log("headers: " + JSON.stringify(req.headers));

  var url = openwhiskApi + req.originalUrl;
  console.log("url: " + url);

  var r = null;
  if(req.method === 'POST') {
     r = request.post({uri: url, json: req.body});
  } if(req.method === 'PUT'){
     r = request.put({uri: url, json: req.body});
  } else {
     r = request(url);
  }

  req.pipe(r).pipe(res);
});

module.exports = router;