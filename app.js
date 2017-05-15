var express = require('express');
var app = express();

var port = process.env.PORT || 3000;

var index = require('./routes/index');
app.use('/api/v1', index);

app.listen(port);
module.exports = app;
