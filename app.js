var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var port = process.env.PORT || 3000;

var index = require('./routes/index');
app.use('/api/v1', index);

app.use(bodyParser.json());

app.listen(port);
module.exports = app;
