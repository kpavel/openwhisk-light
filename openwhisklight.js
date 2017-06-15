var express = require('express');
var app = express();

var port = process.env.PORT || 3000;
process.env["PORT"]=port;

var routes = require('./routes');

app.enable('strict routing');

const config = require('./config');
const url_path_prefix = config.url_path_prefix || '/api/v1';
app.use(url_path_prefix, routes);

app.listen(port);
module.exports = app;
