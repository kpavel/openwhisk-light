var express = require('express');
var router = express.Router();
var openwhisk = require('openwhisk');
var bodyParser = require('body-parser');

const LocalClient = require('./../localclient.js');
const messages = require('./../messages');

const openwhisklocal = require("./../openwhisklocal.js") || {}; // holds node specific settings, consider to use another file, e.g. openwhisklocal.js as option
const burstOWService = process.env.BURST_OW_SERVICE || openwhisklocal.burstOWService; // max number of containers per host

var dockerhost = process.env.DOCKER_HOST || function() {
    throw "please set the DOCKER_HOST environmental variable";
}();

var openwhiskUrl = process.env.OPENWHISK_URL || function() {
    throw "please set the OPENWHISK_URL environmental variable pointing to openwhisk global";
}();

console.log("DOCKERHOST: " + dockerhost);
console.log("OPENWHISK_URL: " + openwhiskUrl);

var client = new LocalClient({dockerurl: dockerhost});

router.use(bodyParser.json());

router.post('/namespaces/:namespace/actions/:actionName', function(req, res) {
  console.log("req: " + JSON.stringify(req.body));
  console.log("authorization: " + JSON.stringify(req.authorization));
  console.log("PATH: " + req.path);
  console.log("params: " + JSON.stringify(req.params));
  console.log("namespace: " + req.params.namespace);
  console.log("actionName: " + req.params.actionName);

  console.log("BODY: " + JSON.stringify(req.body));


  client.invoke(req.params.actionName, req.body)
    .then((result) => {
       console.log("result: " + JSON.stringify(result));
       res.send({response: {result}});
    })
    .catch(function(e) {
      console.log("there was invoke error: " + e);
      if(e == messages.ACTION_MISSING_ERROR){

        console.log("getting action " + req.params.actionName + " from " + openwhiskUrl);
        getAction(req.params.namespace, req.params.actionName, req)
        .then((action)=>{
                console.log("got action: " + JSON.stringify(action));
                console.log("Registering action under openwhisk edge " + JSON.stringify(action));

                client.create(req.params.actionName, action)
                .then((result) => {
                   console.log("action " + req.params.actionName + " registered: " + JSON.stringify(result));
                   client.invoke(req.params.actionName, req.body)
                   .then((result) => {
                      console.log("result of invoke: " + JSON.stringify(result));
                      res.send({response: {result}});
                   })
                   .catch(function(e) {
                     console.log("there was invoke error : " + e);
                   });
                })
                .catch(function(e) {
                  console.log(e);
                  res.status(500).send(e);
                  return;
                })

              if(burstOWService){
                client.request("PUT", burstOWService + req.path, req.body).then(function(result){
                  console.log("--- RESULT: " + JSON.stringify(result));
                  res.send(result);
                }).catch(function(e) {
                  console.log("--- ERROR registering action in bursting!: " + JSON.stringify(e));
                });
              }

        })
        .catch(function (err) {
                        console.log("action get error: " + err);
                        res.status(404).send(err);
                        return;
            });

      } else if(e == messages.TOTAL_CAPACITY_LIMIT){
        console.log("Maximal local capacity reached, delegating action invoke to bursting ow service");

        if(burstOWService){
          client.request("POST", burstOWService + req.path, req.body).then(function(result){
            console.log("--- RESULT: " + JSON.stringify(result));
            res.send(result);
          }).catch(function(e) {
            console.log("--- ERROR: " + JSON.stringify(e));
            res.status(404).send(e);
          });
        }else{
          res.status(404).send(e);
        }
      }else{
        res.status(404).send(e);
      }
    })
});





router.get('/namespaces/:namespace/actions/:actionName', function(req, res) {
        getAction(req.params.namespace, req.params.actionName, req)
        .then((action)=>{
                console.log("get action result: " + JSON.stringify(action));
                res.send(action);
        });
});

router.get('/namespaces', function(req, res) {
        var api_key = from_auth_header(req);
        var ow_client = openwhisk({api: openwhiskUrl, api_key});

        ow_client.namespaces.list()
    .then((namespaces) => {
                console.log("get namespaces result: " + JSON.stringify(namespaces));
                res.json(namespaces)
        })
    .catch(function (err) { console.log("get namespaces error: " + err); res.json({parameters: []});});
});

router.get('/namespaces/:namespace', function(req, res) {
    var api_key = from_auth_header(req);

    client.request("GET", openwhiskUrl + req.path, req.body, {"authorization": req.get("authorization")}).then(function(result){
        res.send(result);
      }).catch(function(e) {
        console.log("--- ERROR: " + JSON.stringify(e));
        res.status(404).send(e);
      });
});

router.get('/namespaces/:namespace/actions', function(req, res) {
    var api_key = from_auth_header(req);

    client.request("GET", openwhiskUrl + req.path, req.body, {"authorization": req.get("authorization")}).then(function(result){
        res.send(result);
      }).catch(function(e) {
        console.log("--- ERROR: " + JSON.stringify(e));
        res.status(404).send(e);
      });
});

router.delete('/namespaces/:namespace/actions/:actionName', function(req, res) {
    var api_key = from_auth_header(req);

    client.request("DELETE", openwhiskUrl + req.path, req.body, {"authorization": req.get("authorization")}).then(function(result){
    	client.deleteAction(req.params.actionName);
        res.send(result);
      }).catch(function(e) {
        console.log("--- ERROR: " + JSON.stringify(e));
        res.status(404).send(e);
      });
});

// create/update action in global ow, then create/update locally, then if applicable create/update in burst service
router.put('/namespaces/:namespace/actions/:actionName', function(req, res) {
	  console.log("req: " + JSON.stringify(req.body));
	  console.log("PATH: " + req.path);
	  console.log("params: " + JSON.stringify(req.params));
	  console.log("namespace: " + req.params.namespace);
	  console.log("actionName: " + req.params.actionName);
	  console.log("BODY: " + JSON.stringify(req.body));

	  client.request("PUT", openwhiskUrl + req.path, req.body, {"authorization": req.get("authorization")}).then(function(result){
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
      }).catch(function(e) {
        console.log("--- ERROR: " + JSON.stringify(e));
        res.status(404).send(e);
      });
});











function getAction(namespace, actionName, req){
        var api_key = from_auth_header(req);
        var ow_client = openwhisk({api: openwhiskUrl, api_key});

    return new Promise(function(resolve,reject) {
        ow_client.actions.get({actionName, namespace})
            .then(function (action) {
                console.log("Got action from " + openwhiskUrl + ": " + JSON.stringify(action));
                resolve(action);
            })
            .catch((e) => {
                reject(e);
            });
    });
}

function from_auth_header(req) {
  var auth = req.get("authorization");
  auth = auth.replace("Basic ", "");
  auth = new Buffer(auth, 'base64').toString('ascii');
  return auth;
}



module.exports = router;

