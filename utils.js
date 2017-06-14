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

module.exports = {request:request};
