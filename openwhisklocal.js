var express = require('express');
var app = express();

var port = process.env.PORT || 3000;
var index = require('./routes/index');
var proxy = require('./routes/proxy');


app.use('/api/v1', index);
app.use('/api/v1', proxy);


app.listen(port);
module.exports = app;