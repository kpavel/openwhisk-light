## Modules:
 - api: routes
 - actions: controller, orchestrate operations, handle (in memory) cache of actions metadata 
 - backend: interaction with Docker API (create, delete, start, stop, list, etc), keep in-memory cache of containers metadata, handle preemption policy
 - actionproxy: interaction with REST API of action containers (init, run)
 - owproxy: interaction with REST API of the OpenWhisk service (catalog + bursting)
 - activations: handle persistence of activation records
 - preemption: keeping 'hot' containers and stopping 'cold'

## Delete action
api: route.delete
- actions.deleteAction

actions.deleteAction
- result = owproxy.deleteAction
- delete action from cache
- respond(result)

owproxy.deleteAction
- send request to OW url
- return response

## Get action
api: route.get
- actions.getAction

actions.getAction
- result = owproxy.getAction
- update action in cache
- if action metadata changed: backend.deprecateContainers
- respond(result)

owproxy.getAction
- send request to OW url 
- return response

backend.deprecateContainers
- mark containers associated with the action as deprecated

## Invoke action
api: route.post
- actions.invokeAction

actions.invokeAction
- if action does not exist in cache: actions.getAction
- retries_options = {timeout, num, condition='out of capacity'}
- retry [container = backend.allocateContainer, retries_option]
- if all retries failed (out of capacity) AND delegation is enabled:
-- response = owproxy.invokeAction
- activation = activations.createActivation
- if non-blocking: respond(activation.id)
- actionproxy.init
- response = actionproxy.invoke
- activations.updateRecord(activation, response)
- if blocking: respond(result)

backend.allocateContainer
- if there are idle (running, non-deprecated, not busy) containers in the action pool, pick one, mark as busy in cache, return
- if total capacity reached, return 'out of capacity' error
- if there are stopped containers in the action pool in cache, mark as busy in cache, start and return
- add container to cache, mark as busy, create container and return

activations.createRecord
- put new record in db

activations.updateRecord
- update record in db

actionproxy.init
- if container is not 'inited':
  - send request to container's IP:8080/init
  - retry until completion/timeout
	  - mark as inited

actionproxy.invoke
- send request to container's IP:8080/run passing the payload
- append result to response
- return response

owproxy.invokeAction(action, auth, payload)
- send request to OW url 
- return response

Preemption
=========
- on startup
	- remove all action containers
- on preemption timeout
	- check condition to start preempting containers [policy.condition()]
		- number of active containers is above high watermark
	- if below threshold, return
	- select containers for preemption [policy.select()]
		- N = identify number of containers for preemption (to reach below low watermark)
		- choose N least recently used containers
	- stop selected containers
