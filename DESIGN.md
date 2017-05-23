## Modules:
 - api: routes
 - controller: handlers used in routes, orchestrating operations, handle (in memory) cache of actions metadata 
 - backend: interaction with Docker API (create, delete, start, stop, list, etc), keep in-memory cache of containers metadata, handle preemption policy
 - actionproxy: interaction with REST API of action containers (init, run)
 - owproxy: interaction with REST API of the OpenWhisk service (catalog + bursting)
 - activations: handle persistence of activation records

## Delete action
api: route.delete
- result = controller.deleteAction(action=req.path, auth=req.authorization)
- res.send(result)

controller.deleteAction(action, auth)
- result = owproxy.deleteAction(action, auth)
- delete action from cache
- return result

owproxy.deleteAction(action, auth)
- send request to OW url (via owclient?)
- return response

## Get action
api: route.get
- result = controller.getAction(action=req.path, auth=req.authorization)
- res.send(result)

controller.getAction(action, auth)
- result = owproxy.getAction(action, auth)
- update action in cache
- if action metadata changed: backend.deprecateContainers(action)
- return result

owproxy.getAction(action, auth)
- send request to OW url 
- return response

backend.deprecateContainers(action)
- mark containers associated with the action as deprecated

## Invoke action
api: route.post
- result = controller.invokeAction(action=req.path, auth=req.authorization, payload=req.body, notifier)
- notifier(activation):
  - res.send(activation)
- res.send(result)

controller.invokeAction(action, auth, payload, notifier)
- if action does not exist in cache: controller.getAction(action, auth)
- retries_options = {timeout, num, condition='out of capacity'}
- retry [container = backend.allocateContainer(action), retries_option]
- if all retries failed (out of capacity) AND bursting is enabled:
-- response = owproxy.invokeAction(action, auth, payload)
- activation = activations.createRecord(action, payload)
- if non-blocking: notifier.returnActivation(activation)
- if container is 'new': 
  - actionproxy.init(action, container); 
  - mark container in cache as not 'new'
- response = actionproxy.invoke(container, payload)
- activations.updateRecord(activation, response)
- return response.result

backend.allocateContainer(action)
- if there are idle (running, non-deprecated, not busy) containers in the action pool, pick one, mark as busy in cache, return
- if total capacity reached, return 'out of capacity' error
- if there are stopped containers in the action pool in cache, start container, mark as busy (and 'new') in cache, return
- add container to cache, mark as busy (and 'new'), create container, return

activations.createRecord(action, payload)
- put new record in db

activations.updateRecord(activation, response)
- update record in db

actionproxy.init(action, container)
- send request to container's IP:8080/init
- retry until completion/timeout

actionproxy.invoke(container, payload)	
- send request to container's IP:8080/run passing the payload
- append logs to response
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
