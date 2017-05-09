var express = require('express');
var bodyParser = require('body-parser');
var app = express();

app.use(bodyParser.json());
var port = process.env.PORT || 3000;

const LocalClient = require('./localclient.js');
const messages = require('./messages');

var dockerhost = process.env.DOCKER_HOST || function() { 
    throw "please set the DOCKER_HOST environmental variable";
}();

console.log("DOCKERHOST: " + dockerhost);
var client = new LocalClient({dockerurl: dockerhost});

const openwhisklocal = require("./openwhisklocal.js") || {}; // holds node specific settings, consider to use another file, e.g. openwhisklocal.js as option
const burstOWService = process.env.BURST_OW_SERVICE || openwhisklocal.burstOWService; // max number of containers per host 


app.post('/namespaces/:namespace/actions/:actionName', function(req, res) {
  console.log("req: " + JSON.stringify(req.body));
  console.log("PATH: " + req.path);
  console.log("params: " + JSON.stringify(req.params));
  console.log("namespace: " + req.params.namespace);
  console.log("actionName: " + req.params.actionName);

  console.log("BODY: " + JSON.stringify(req.body));


  client.invoke(req.params.actionName, req.body)
    .then((result) => {
       console.log("result: " + JSON.stringify(result));
       res.send(result);
    })
    .catch(function(e) {
      console.log("there was invoke error: " + e);
      if(e == messages.TOTAL_CAPACITY_LIMIT){
        console.log("!!!!!!!!!!++++++++++ Here will delegate the post to backup ow service +++++++++!!!!!!!!!!");

        if(burstOWService){
          client.request("POST", burstOWService + req.path, req.body).then(function(result){
            console.log("--- RESULT: " + JSON.stringify(result));
            res.send(result);
          }).catch(function(e) {
            console.log("--- ERRORR!: " + JSON.stringify(e));

            // if(JSON.stringify(e).indexOf("Error, action missing")){
            //   console.log("Getting action")
            // }
          });
        }else{
          res.status(404).send(e);  
        }
      }else{
        res.status(404).send(e);
      }
    })
});

app.put('/namespaces/:namespace/actions/:actionName', function(req, res) {
  console.log("req: " + JSON.stringify(req.body));
  console.log("PATH: " + req.path);
  console.log("params: " + JSON.stringify(req.params));
  console.log("namespace: " + req.params.namespace);
  console.log("actionName: " + req.params.actionName);
  console.log("BODY: " + JSON.stringify(req.body));


  client.create(req.params.actionName, req.body)
    .then((result) => {
       console.log("result: " + JSON.stringify(result));
       res.send(result);
    })
    .catch(function(e) {
      console.log(e);
      res.status(500).send(e);
    })

  if(burstOWService){
    client.request("PUT", burstOWService + req.path, req.body).then(function(result){
      console.log("--- RESULT: " + JSON.stringify(result));
      res.send(result);
    }).catch(function(e) {
      console.log("--- ERRORR registering action in bursting!: " + JSON.stringify(e));

      // if(JSON.stringify(e).indexOf("Error, action missing")){
      //   console.log("Getting action")
      // }
    });
  }
});

app.listen(port);
module.exports = app;
