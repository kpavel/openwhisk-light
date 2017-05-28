var openwhisk = require('openwhisk');

function main(params) {
  var ow = openwhisk();  
  console.log("INVOKING owl-test");
  //return ow.actions.invoke({actionName:'owl-test', blocking:true, params:params}).then(activation => {
  return ow.actions.invoke({actionName:'/whisk.system/utils/echo', blocking:true, params:params}).then(activation => {
      console.log("RES: " + JSON.stringify(activation));
      return activation.response.result;
    }).catch(err => {
      console.error('failed to invoke actions', err);
      return {error: err};
    });
}

