# openwhisk-local

OpenWhisk local docker Node.js REST API module.


## Current npm installation from github only


`npm install git+https://git@github.com/kpavel/openwhisk-local.git`

## Usage

 * Contains web interface (express) that matching OpenWhisk REST API (currently only action invoke and create implemented)
 * Supports docker swarm or regular docker engine backends
 * Running local ow agent on webserver requires to set DOCKER_HOST environment variable pointing to docker engine rest API or Docker swarm manager
 * PORT where agent running. If not specified, 3000 will be used
 

### Getting started

To use `openwhisk-local` as library first you need to instantiate it:

``` js
var client = new LocalClient({dockerurl: 'http://localhost:2375' });

```

To start `openwhisk-local` as agent:

``` sh
export DOCKER_HOST = 'http://localhost:2375'
cd node_modules/openwhisk-local/; npm start

```


### Creating an action in local openwhisk:

``` js
// action registered in local openwhisk environment. action json object structure matches OpenWhisk API action create request body
client.create(actionName, action)
	.then((result) => {
	   console.log("result: " + JSON.stringify(result));
	});
    

// action invoke. in case action not registered appropriate error thrown
client.invoke(actionName, data)
    .then((result) => {
       console.log("result: " + JSON.stringify(result));
    });


## Helper functions

* `request` - allows to 

``` js
//followProgress(stream, onFinished, [onProgress])
client.request("POST", burstServer + path, data).then(function(result){
            console.log("--- RESULT: " + JSON.stringify(result));
          });
```

## License
TODO

Licensed under the Apache license, version 2.0 (the "license"); You may not use this file except in compliance with the license. You may obtain a copy of the license at:

    http://www.apache.org/licenses/LICENSE-2.0.html

Unless required by applicable law or agreed to in writing, software distributed under the license is distributed on an "as is" basis, without warranties or conditions of any kind, either express or implied. See the license for the specific language governing permissions and limitations under the license.
