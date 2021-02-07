const childProcess = require('child_process');

const Process = function(config) {
  this._config = config;
};

Process.prototype.start = function() {
  const config = this._config;
  const process = this._process =
      childProcess.spawn(config.command, config.args);
  this._stdout = '';
  this._stderr = '';
  this._code = null;

  process.stdout.on('data', function(data) {
    this._stdout += data;
    if (this._stdout.length > 1024 * 1024) {
      this._stdout = this._stdout.substring(this._stdout.length - 1024 * 1024);
    }
  }.bind(this));
  process.stderr.on('data', function(data) {
    this._stderr += data;
    if (this._stderr.length > 1024 * 1024) {
      this._stderr= this._stdout.substring(this._stdout.length - 1024 * 1024);
    }
  }.bind(this));

  return new Promise(function(resolve) {
    process.on('close', function(code, signal) {
      this._code = code !== null ? code : signal;
      resolve(code);
    }.bind(this));
  }.bind(this));
};

Process.prototype.getName = function() {
  return this._config.name;
};

Process.prototype.getPid = function() {
  return this._process.pid;
};

Process.prototype.getCode = function() {
  return this._code;
};

Process.prototype.getStdout = function() {
  return this._stdout;
};

Process.prototype.getStderr = function() {
  return this._stderr;
};

Process.prototype.restart = function() {
  this._process.on('exit', function() {
    this.start();
  }.bind(this));
  this._process.kill();
};

module.exports = Process;
