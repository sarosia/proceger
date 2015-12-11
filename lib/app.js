var express = require("express");
var morgan = require("morgan");
var static = require("serve-static");
var Process = require("./process");

var config = require(process.env["HOME"] + "/.proceger.json");
var processes = [];

for (var i = 0; i < config.processes.length; i++) {
    var proc = new Process(config.processes[i]);
    proc.start();
    processes.push(proc);
}

var app = express();
app.use(morgan("tiny"));
app.use(static(__dirname + "/../static"));

app.get("/process/list", function (req, res) {
    var output = [];
    for (var i = 0; i < processes.length; i++) {
        var process = processes[i];
        output.push({
            id: i,
            name: process.getName(),
            pid: process.getPid(),
            stdout: process.getStdout(),
            stderr: process.getStderr(),
            code: process.getCode()
        });
    }

    res.write(JSON.stringify(output));
    res.end();
});

app.get("/process/restart", function (req, res) {
    var process = processes[req.query.id];
    if (process) {
        process.restart();
    }
    res.end("OK");
});

module.exports = app;
