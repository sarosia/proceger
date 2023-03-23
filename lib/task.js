const logger = require('./logger');
const {spawn} = require('child_process');
const glob = require('glob-promise');
const path = require('path');
const fs = require('fs').promises;
const kill = require('tree-kill');

class Task {
  #git = null;
  #name = null;
  #child = null;
  #startTime = null;
  #status = 'IDLE';
  #code = null;

  #startPromise = null;
  #stopPromise = null;

  #pollUpdatesTimeout = null;
  #pollUpdatesInterval = null;

  constructor(config, git, pollUpdatesInterval) {
    this.#git = git;
    this.#name = config.name;
    this.#pollUpdatesInterval = pollUpdatesInterval;
  }

  getName() {
    return this.#name;
  }

  async toJson() {
    return {
      name: this.#name,
      git: this.#git.getUrl(),
      path: this.#git.getRepoPath(),
      revision: this.#git.getRevision(),
      pid: this.#child ? this.#child.pid : -1,
      startTime: this.#startTime,
      logs: await this.getLogs(),
      status: this.#status,
      code: this.#code,
    };
  }

  logInfo(message) {
    logger.info(`Task(${this.#name}): ${message}`);
  }

  logDebug(message) {
    logger.debug(`Task(${this.#name}): ${message}`);
  }

  updateStatus(status) {
    this.logInfo(`Transisting from ${this.#status} to ${status}.`);
    this.#status = status;
  }

  async start() {
    this.logInfo(`Starting, current status=${this.#status}"`);
    switch (this.#status) {
      case 'RUNNING':
        return;
      case 'STARTING':
        return this.#startPromise;
      case 'STOPPING':
        await this.#stopPromise;
      case 'IDLE':
      case 'STOPPED':
        this.#startPromise = this.startImpl();
        await this.#startPromise;
        break;
      default:
        throw new Error(`Unknown status ${this.#status}`);
    }
  }

  async startImpl() {
    this.updateStatus('STARTING');
    this.logInfo(`Initializing git repository...`);
    const newRepo = await this.#git.init();
    if (newRepo) {
      await this.runCommand('npm ci', true);
    }
    if (this.#child !== null) {
      kill(this.#child.pid);
      this.#child = null;
    }
    this.logInfo(`Running "npm start"...`);
    this.#child = await this.runCommand('npm start', false);
    this.logInfo(`Child process launched with pid="${this.#child.pid}"`);
    this.updateStatus('RUNNING');
    this.#child.on('exit', (code, signal) => {
      if (this.#child !== null) {
        this.logInfo(`Process "${this.#child.pid}" terminated with ` +
          `code=${code} signal=${signal}.`);
        this.updateStatus('STOPPED');
        this.#code = code !== null ? code : signal;
        this.#child = null;
      }
    });
    this.#startTime = new Date();
  }

  async stop() {
    switch (this.#status) {
      case 'IDLE':
      case 'STOPPED':
        return;
      case 'STOPPING':
        return this.#stopPromise;
      case 'STARTING':
        await this.#startPromise;
      case 'RUNNING':
        this.#stopPromise = this.stopImpl();
        await this.#stopPromise;
        break;
      default:
        throw new Error(`Unknown status ${this.#status}`);
    }
  }

  async stopImpl() {
    if (this.#pollUpdatesTimeout != null) {
      clearTimeout(this.#pollUpdatesTimeout);
      this.#pollUpdatesTimeout = null;
    }
    this.updateStatus('STOPPING');
    return new Promise((resolveFunc, rejectFunc) => {
      if (this.#child === null) {
        resolveFunc();
        return;
      }
      this.#child.on('exit', (code, signal) => {
        if (this.#child !== null) {
          this.logInfo(`Process "${this.#child.pid}" terminated with ` +
            `code=${code} signal=${signal}.`);
          this.#child = null;
          this.updateStatus('STOPPED');
          this.#code = code !== null ? code : signal;
        }
        resolveFunc();
      });
      this.logInfo(`Killing process "${this.#child.pid}"...`);
      kill(this.#child.pid);
    });
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async runCommand(command, sync) {
    this.logInfo(`Running command "${command}"...`);
    const child = spawn(command, {
      cwd: this.#git.getRepoPath(),
      shell: true,
    });
    child.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (line) {
          this.logDebug(`${command} > ${line}`);
        }
      }
    });
    child.stderr.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (line) {
          this.logInfo(`${command} > ${line}`);
        }
      }
    });

    if (!sync) {
      return child;
    }

    return new Promise((resolve, reject) => {
      child.on('exit', (code, signal) => {
        this.logInfo(`Command "${command}" finished with exit code ${code}.`);
        if (code === 0) {
          resolve(0);
        } else if (code !== null) {
          reject(new Error(
              `Command "${command}" exit with error code: "${code}"`));
        } else {
          reject(new Error(
              `Command "${command}" exit with signal: "${signal}"`));
        }
      });
    });
  }

  async pollUpdates() {
    const updated = await this.#git.update();
    this.logInfo(`Poll updates, updated=${updated}.`);
    if (updated) {
      await this.restart();
    }
    if (this.#status === 'RUNNING' && this.#pollUpdatesTimeout === null) {
      this.#pollUpdatesTimeout = setTimeout(async () => {
        this.#pollUpdatesTimeout = null;
        await this.pollUpdates();
      }, this.#pollUpdatesInterval);
    }
  }

  async getLogs() {
    const logs = {};
    const files = await glob(path.join(this.#git.getRepoPath(), '*.log'));
    for (const file of files) {
      logs[path.basename(file)] = await fs.readFile(file, 'utf-8');
    }
    return logs;
  }
}

module.exports = Task;
