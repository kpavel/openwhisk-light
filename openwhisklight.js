var express = require('express');
var app = express();

var port = process.env.PORT || 3000;
process.env["PORT"]=port;

var routes = require('./routes');

app.enable('strict routing');

app.use('/api/v1', routes);

app.listen(port);
module.exports = app;
