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
  #status = 'IDLE';
  #code = null;
  #timeout = null;

  constructor(config, git) {
    this.#git = git;
    this.#name = config.name;
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

  async start() {
    await this.startOrUpdate();
  }

  async stop() {
    if (this.#timeout != null) {
      clearTimeout(this.#timeout);
      this.#timeout = null;
    }
    return new Promise((resolveFunc, rejectFunc) => {
      if (this.#child === null) {
        resolveFunc();
        return;
      }
      this.#child.on('close', (code, signal) => {
        if (this.#child !== null) {
          logger.info(`Process "${this.#child.pid}" terminated with ` +
            `code=${code} signal=${signal}.`);
          this.#child = null;
          this.#status = 'STOPPED';
          this.#code = code !== null ? code : signal;
        }
        resolveFunc();
      });
      logger.info(`Killing process "${this.#child.pid}"...`);
      this.#child.kill();
    });
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async runCommand(command, sync) {
    logger.info(`Running command "${command}"...`);
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
      child.on('close', (code, signal) => {
        logger.info(`Command "${command}" finished with exit code ${code}.`);
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

  async startOrUpdate() {
    await this.#git.init();
    const updated = await this.#git.update();
    if (this.#status !== 'RUNNING' || updated) {
      await this.runCommand('npm ci', true);
      if (this.#child !== null) {
        this.#child.kill();
        this.#child = null;
      }
      this.#child = await this.runCommand('npm start', false);
      this.#status = 'RUNNING';
      this.#child.on('close', (code, signal) => {
        if (this.#child !== null) {
          logger.info(`Process "${this.#child.pid}" terminated with ` +
            `code=${code} signal=${signal}.`);
          this.#status = 'STOPPED';
          this.#code = code !== null ? code : signal;
          this.#child = null;
        }
      });
      this.#startTime = new Date();
    }

    this.#timeout = setTimeout(() => {
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
