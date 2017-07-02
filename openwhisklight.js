const config = require('./config'),
      url_path_prefix = config.url_path_prefix || '/api/v1',
      routes = require('./routes'),
      app = require('express')();

process.title = "openwhisk-light";

console.debug("Config: " + JSON.stringify(config));

app.enable('strict routing');
app.use(url_path_prefix, routes);
app.listen(config.owl_port);

module.exports = app;
