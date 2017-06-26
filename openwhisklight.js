const config = require('./config'),
      url_path_prefix = config.url_path_prefix || '/api/v1',
      port = process.env.PORT || 3000,
      routes = require('./routes'),
      app = require('express')();

process.env["PORT"]=port;
process.title = "openwhisk-light";

console.debug("Config: " + JSON.stringify(config));

app.enable('strict routing');
app.use(url_path_prefix, routes);
app.listen(port);

module.exports = app;
