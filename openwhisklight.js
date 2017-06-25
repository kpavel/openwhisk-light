var logger = require('winston');

// Set up log file. (you can also define size, rotation etc.)
logger.add(logger.transports.File, { filename: 'owl.log' });
// Overwrite some of the build-in console functions
console.error=logger.error;
console.log=logger.info;
console.info=logger.info;
console.debug=logger.debug;
console.warn=logger.warn;

var express = require('express');
var app = express();

var port = process.env.PORT || 3000;

process.env["PORT"]=port;
process.title = "openwhisk-light";
console.log("process.title: " + process.title);
var routes = require('./routes');

app.enable('strict routing');

const config = require('./config');
const url_path_prefix = config.url_path_prefix || '/api/v1';

console.log("TOTAL_CAPACITY: " + config.total_capacity);
console.log("DELEGATE_ON_FAILURE: " + config.delegate_on_failure);

app.use(url_path_prefix, routes);

app.listen(port);
module.exports = app;
