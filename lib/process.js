var child_process = require("child_process");

var Process = function (config) {
    this._config = config;
    this.start();
};

Process.prototype.start = function () {
    var config = this._config;
    var process = this._process = child_process.spawn(config.command, config.args);
    this._stdout = "";
    this._stderr = "";
    process.stdout.on("data", function (data) {
        this._stdout += data;
        if (this._stdout.length > 1024 * 1024) {
            this._stdout = this._stdout.substring(this._stdout.length - 1024 * 1024);
        }
    }.bind(this));
    process.stderr.on("data", function (data) {
        this._stderr += data;
        if (this._stderr.length > 1024 * 1024) {
            this._stderr= this._stdout.substring(this._stdout.length - 1024 * 1024);
        }
    }.bind(this));

    this._code = new Promise(function (resolve) {
        process.on("close", function (code) {
            resolve(code);
        });
    });
};

Process.prototype.getName = function () {
    return this._config.name;
};

Process.prototype.getPid = function () {
    return this._process.pid;
};

Process.prototype.getCode = function () {
    return this._code;
};

Process.prototype.getStdout = function () {
    return this._stdout;
};

Process.prototype.getStderr = function () {
    return this._stderr;
};

Process.prototype.restart = function () {
    this._process.kill();
    this.start();
};

module.exports = Process;
