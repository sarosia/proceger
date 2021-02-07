const Git = require('./git');
const logger = require('./logger');
const {spawn} = require('child_process');
const glob = require('glob-promise');
const path = require('path');
const fs = require('fs').promises;

class Task {
  #git = null;
  #name = null;
  #child = null;
  #startTime = null;

  constructor(config) {
    this.#git = new Git(config.git.url);
    this.#name = config.name;
  }

  async toJson() {
    return {
      name: this.#name,
      git: this.#git.getUrl(),
      path: this.#git.getRepoPath(),
      pid: this.#child ? this.#child.pid : -1,
      startTime: this.#startTime,
      logs: await this.getLogs(),
    };
  }

  async start() {
    await this.startOrUpdate();
  }

  async runCommand(command, sync) {
    const child = spawn(command, {
      cwd: this.#git.getRepoPath(),
      shell: true,
    });
    child.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (line) {
          logger.info(`${command} > ${line}`);
        }
      }
    });
    child.stderr.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (line) {
          logger.error(`${command} > ${line}`);
        }
      }
    });

    if (!sync) {
      return child;
    }

    return new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) {
          resolve(0);
        } else {
          reject(new Error(
              `Command "${command}" exit with error code: "${code}"`));
        }
      });
    });
  }

  async startOrUpdate() {
    await this.#git.init();
    const updated = await this.#git.update();
    if (updated) {
      await this.runCommand('npm ci', true);
      if (this.#child !== null) {
        this.#child.kill();
        this.#child = null;
      }
      this.#child = await this.runCommand('npm start', false);
      this.#startTime = new Date();
    }

    setTimeout(() => {
      this.startOrUpdate();
    }, 5 * 60 * 1000);
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
