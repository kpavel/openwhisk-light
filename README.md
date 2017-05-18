# openwhisk-local

OpenWhisk local docker Node.js REST API module.


## Current npm installation from github only


`npm install git+https://git@github.com/kpavel/openwhisk-local.git`

## Usage

 * Contains web interface matching OpenWhisk REST API.
 * Supports docker swarm or regular docker engine backends.
 * Supports optional bursting service specified by BURST_OW_SERVICE environment variable
 * PORT where agent running. If not specified, 3000 will be used
 * Running `openwhisk-local` on webserver requires to set following environment variables:
 	- DOCKER_HOST  pointing to docker engine rest API or Docker swarm manager, e.g. http://${MY_HOST_WITH_DOCKER_REST}:2375
	- OPENWHISK_HOST  pointing to OpenWhisk global, e.g. https://openwhisk.ng.bluemix.net
	- OPENWHISK_API  poining to OpenWhisk global REST API, e.g. https://openwhisk.ng.bluemix.net/api/v1  	

### Getting started

Best and fastest option is to start `openwhisk-local` is inside docker container.
Use [DOCKERFILE](Dockerfile) to build `openwhisk-local` docker image
``` sh
docker build -t ow-local --no-cache .
docker run -d --net=my-net -p 3024:3042 -e PORT=3042 -e DOCKER_HOST=${MY_HOST}:2375 -e OPENWHISK_API=https://openwhisk.ng.bluemix.net/api/v1 -e OPENWHISK_HOST=https://openwhisk.ng.bluemix.net ow-local
```
* DOCKER_HOST must be hostname routable from my-net network
* Action containers will run on the same virtual network (my-net in the example above) as `openwhisk-local`

To start `openwhisk-local` as agent not inside docker container:

``` sh
export DOCKER_HOST = http://${MY_HOST}:2375
export OPENWHISK_API = https://openwhisk.ng.bluemix.net/api/v1
export OPENWHISK_HOST = https://openwhisk.ng.bluemix.net
export OW_LOCAL_DOCKER_NW_NAME = ${DOCKER_VIRTUAL_NETWORK}
cd node_modules/openwhisk-local/; npm start

```

### Bursting service
* Another openwhisk-local agent running with Docker Swarm specified in DOCKER_HOST environment variable
* Openwhisk global

### Openwhisk CLI

* command example
``` sh
wsk --apihost ${MY_HOST}:3024  action invoke ${MY_OW_ACTION_NAME} -b -r

```

* Status:


| COMMAND          	|        	| STATUS        	| COMMENTS        	|
|------------------	|--------	|---------------	|---------------	|
| action           	| create 	| Delegated 	    |					|
|                  	| update 	| Delegated 	    |					|
|                  	| invoke 	| Supported     	|with -b (blocking) flag	|
|                  	| get    	| Supported     	|also updates action locally	|
|                  	| delete 	| Supported     	|					|
|                  	| list   	| Delegated     	|					|
| activation       	|        	| Not supported 	|					|
| package          	|        	| Delegated 	    |					|
| rule             	|        	| Not supported 	|					|
| sdk              	|        	| Not supported 	|					|
| property         	|        	| Not supported 	|					|
| namespace        	| list   	| Delegated     	|					|
| list             	|        	| Not supported 	|					|
| bluemix 	      	|        	| Not supported 	|					|
| trigger 	      	|        	| Not supported 	|					|
| api-experimental 	|        	| Not supported 	|					|
| api 	      	    |        	| Not supported 	|					|


## License
TODO

Licensed under the Apache license, version 2.0 (the "license"); You may not use this file except in compliance with the license. You may obtain a copy of the license at:

    http://www.apache.org/licenses/LICENSE-2.0.html

Unless required by applicable law or agreed to in writing, software distributed under the license is distributed on an "as is" basis, without warranties or conditions of any kind, either express or implied. See the license for the specific language governing permissions and limitations under the license.
