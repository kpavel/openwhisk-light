var express = require('express');
var router = express.Router();

const config = require("./../config.js") || {}; // holds node specific settings, consider to use another file, e.g. config.js as option

var openwhiskHost = process.env.OPENWHISK_HOST || function() {
    throw "please set the OPENWHISK_HOST environmental variable pointing to openwhisk global, e.g. https://openwhisk.ng.bluemix.net";
}();

console.log("OPENWHISK_HOST: " + openwhiskHost);

//var stringify = require('json-stringify-safe');

var request = require('request');

/*
 * Proxy to global openwhisk specified by OPENWHISK_HOST environment variable
 */
router.use('*', function(req, res) {
  var url = openwhiskHost + req.originalUrl;
  console.log("url: " + url);
  console.log("delegating " + req.method + " to " + url);
  
  var r = null;
  if(req.method === 'POST') {
    req.pipe(request.post({uri: url, json: req.body}), {end: false}).pipe(res);
  } if(req.method === 'PUT'){
    req.pipe(request.put({uri: url, json: req.body}), {end: false}).pipe(res);
  } else {
    req.pipe(request(url)).pipe(res);
  }
});

module.exports = router;