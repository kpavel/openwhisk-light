const rp = require('request-promise')

function request (method, url, body, headers) {
    const req = params(method, url, body);
    if(headers){
        req.headers = headers;
    }
    return rp(req);
}

function params (method, url, body) {
  var res = {
      json: true,
      method: method,
      url
    };
  if(!body){
      return res;
  }else{
      return Object.assign(
      res
    , {body});
  }
}

module.exports = {request:request};
