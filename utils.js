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

const STATE = {
	stopped : 0, 
    reserved : 1,
	running : 2, // started and inited
	allocated : 3    // currently used by action
};

module.exports = {request, STATE};
