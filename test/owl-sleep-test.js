function main(params) {
    console.log("params: " + JSON.stringify(params));
    sleep(params.timeout);
    console.info("Finished sleeping for " + params.timeout);
    return params;
}

function sleep(milliseconds) {
    console.log("in sleep with " + milliseconds);
    var start = new Date();
    console.log("start: " + start);
    while ((new Date()) - start <= milliseconds ) {}
    console.log("(new Date()) - start = " + ((new Date()) - start));
    console.log("finished waiting for " + milliseconds + "msec");
}
