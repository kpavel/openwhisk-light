## OpenWhisk Light (OWL) Configuration Parameters
There are several aspects of OWL's behavior that can be configured via environment variables (retrieved in `config.js`). The following table summarizes the main options.

| Area | Config option | Description | Default
| ---  | ---           | ---         | ---
| Backend | DOCKER_HOST | Location of the Docker Engine, following standard Docker notation (e.g., tcp://localhost:2375) | none (**throws exception if not set**)
|         | OWL_NET_NAME | Docker network name accessible from OWL runtime, to be used for communication with action containers | none (not required of OWL is deployed in a container on the same Docker Engine)
|         | OWL_PORT | Number of port where OWL will be listening | 3000
|         | OWL_NEXT_OPENWHISK | URL of the backend OpenWhisk service, used as a catalog of actions (and for delegation -- see OWL_DELEGATE_ON_FAILURE) | https://openwhisk.ng.bluemix.net:443
| Resource Management | OWL_HOST_CAPACITY | Total amount of containers that can run concurrently on the same host | 5
|                     | OWL_PREEMPTION_ENABLED | Enable recycling (preemption) of idle containers | false
|                     | OWL_PREEMPTION_PERIOD | How often (in seconds) the preemption thread should be triggered | 10
|                     | OWL_PREEMPTION_HIGH | High watermark for container preemption - i.e., when utilization exceeds this threshold, preemption starts removing containers (if enabled) | 0.75
|                     | OWL_PREEMPTION_LOW | Low watermark for container preemption - i.e., when utilization falls bellow this threshold, preemption stops removing containers (if enabled). See also OWL_PREEMPTION_IDLE. | 0.25
|                     |  OWL_PREEMPTION_IDLE | After how many seconds should preemption remove an idle container (even if below OWL_PREEMPTION_LOW) | 600
|                     | OWL_RETRIES_NUMBER | When there is no available capacity on the host to create an action container, how many retries should we attempt before declaring failure (see also OWL_RETRIES_TIMEOUT and OWL_DELEGATE_ON_FAILURE) | 1000
|                     | OWL_RETRIES_TIMEOUT | For how long should we wait after each attempt, before retrying (as per OWL_RETRIES_NUMBER) | 100
|                     | OWL_DELEGATE_ON_FAILURE | If set to 'true', when OWL is unable to run the action container locally due to lack of available capacity (e.g., when preemption is disabled or when preemption retries are exceeded), action invocations are delegated to the backend OpenWhisk | false
| Misc | OWL_LOG_LEVEL | OWL internal log level (error, warn, info, debug) | debug
|      | OWL_BLACKBOX_AUTO_PULL | If set to 'true', images for blackbox actions are automatically pulled from docker hub (and not expected to be pre-existant on the local Docker engine) | true

