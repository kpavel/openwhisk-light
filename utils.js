const rp = require('request-promise')

function request (method, url, body, headers) {
    const req = params(method, url, body);
    if(headers){
        req.headers = headers;
    }
    return rp(req);
}

function params (method, url, body) {
  return Object.assign({
      json: true,
      method: method,
      url
    }, {body});
}


/**
 * state machine:
 * 
 * running -> allocated -> running -> stopped -> started
 * 
 */


const STATE = {
	stopped : 0, 
    reserved : 1,
    started : 2, // started, but not yet inited 
	running : 3, // started and inited
	allocated : 4    // currently used by action
};



module.exports = {request, STATE};
