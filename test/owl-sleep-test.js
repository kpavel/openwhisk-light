function main(args) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        resolve({ timeout: args.timeout });
      }, args.timeout);
   })
}
