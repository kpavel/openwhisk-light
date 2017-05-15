# openwhisk-local

OpenWhisk local docker Node.js REST API module.


## Current npm installation from github only


`npm install git+https://git@github.com/kpavel/openwhisk-local.git`

## Usage

 * Contains web interface (express) matching OpenWhisk REST API. Currently supports action invoke, action get and namespace get.
 * Supports docker swarm or regular docker engine backends
 * Running local `openwhisk-local` on webserver requires to set DOCKER_HOST environment variable pointing to docker engine rest API or Docker swarm manager
 * PORT where agent running. If not specified, 3000 will be used
 

### Getting started

Best and fastest option is to start `openwhisk-local` inside docker container.
Use [a relative link](Dockerfile) to build `openwhisk-local` docker image
``` sh
docker build -t ow-local --no-cache .
docker run -d --net=my-net -p 3024:3042 -e PORT=3042 -e DOCKER_HOST=http://${MY_HOST}:2375 -e OPENWHISK_URL=https://openwhisk.ng.bluemix.net/api/v1 ow-local
```
* DOCKER_HOST must be hostname routable from my-net network
* Action containers will run on the same virtual network (my-net in the example above) as `openwhisk-local`

To start `openwhisk-local` as agent not inside docker container:

``` sh
export DOCKER_HOST = http://${MY_HOST}:2375
export OPENWHISK_URL = https://openwhisk.ng.bluemix.net/api/v1
export OW_LOCAL_DOCKER_NW_NAME = ${DOCKER_VIRTUAL_NETWORK}
cd node_modules/openwhisk-local/; npm start

```

`openwhisk-local` can be used as library:

``` js
var client = new LocalClient({dockerurl: 'http://localhost:2375' });

```

## License
TODO

Licensed under the Apache license, version 2.0 (the "license"); You may not use this file except in compliance with the license. You may obtain a copy of the license at:

    http://www.apache.org/licenses/LICENSE-2.0.html

Unless required by applicable law or agreed to in writing, software distributed under the license is distributed on an "as is" basis, without warranties or conditions of any kind, either express or implied. See the license for the specific language governing permissions and limitations under the license.
