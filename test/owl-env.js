function main(args) {
    console.log(JSON.stringify(args));
    console.log("ENV: " + JSON.stringify(process.env));
    args["env"] = process.env;
    return args;
}
