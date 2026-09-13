const {spawn} = require('child_process');
const glob = require('glob-promise');
const path = require('path');
const fs = require('fs/promises');
const {createWriteStream, existsSync} = require('fs');
const os = require('os');
const kill = require('tree-kill');
const Apper = require('@sarosia/apper');

function resolvePath(p) {
  if (!p) return null;
  const homeDir = process.env.HOME || os.homedir();
  if (p === '~') return homeDir;
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(homeDir, p.slice(2));
  }
  return path.resolve(p);
}

class Task {
  #git = null;
  #name = null;
  #path = null;
  #child = null;
  #startTime = null;
  #status = 'IDLE';
  #code = null;
  #logger = null;
  #command = 'npm start';
  #env = {};
  #enabled = true;

  #startPromise = null;
  #stopPromise = null;

  #pollUpdatesTimeout = null;
  #pollUpdatesInterval = null;

  constructor(config, git, pollUpdatesInterval, logger = null) {
    this.#git = git;
    this.#name = config.name;
    this.#command = (config.command && config.command.trim()) || 'npm start';
    const configPath = config.path || config.cwd;
    if (configPath) {
      this.#path = resolvePath(configPath);
    } else if (this.#git !== null) {
      this.#path = this.#git.getRepoPath();
    } else {
      this.#path = process.cwd();
    }
    this.#env = config.env || {};
    this.#pollUpdatesInterval = pollUpdatesInterval;
    this.#logger = logger || new Apper.Logger('proceger');
    this.#enabled =
      config.enabled !== undefined ? Boolean(config.enabled) : true;
    if (!this.#enabled) {
      this.#status = 'STOPPED';
    }
  }

  getName() {
    return this.#name;
  }

  getPath() {
    return this.#path;
  }

  getCommand() {
    return this.#command;
  }

  getEnv() {
    return this.#env;
  }

  getStatus() {
    return this.#status;
  }

  isEnabled() {
    return this.#enabled;
  }

  setEnabled(enabled) {
    this.#enabled = Boolean(enabled);
  }

  updateConfig(updates = {}) {
    if (updates.command !== undefined) {
      this.#command = (typeof updates.command === 'string' &&
        updates.command.trim()) || 'npm start';
    }
    if (updates.path !== undefined || updates.cwd !== undefined) {
      const p = updates.path || updates.cwd;
      if (p) {
        this.#path = resolvePath(p);
      }
    }
    if (updates.env !== undefined && typeof updates.env === 'object') {
      this.#env = Object.assign({}, this.#env, updates.env);
    }
    if (updates.enabled !== undefined) {
      this.#enabled = Boolean(updates.enabled);
    }
  }

  async toJson(options = {}) {
    const includeLogs = options.includeLogs !== undefined ?
      Boolean(options.includeLogs) : true;
    let logs = {};
    if (includeLogs) {
      logs = await this.getLogs();
    } else {
      const logFiles = await this.getLogFiles();
      for (const f of logFiles) {
        logs[f] = null;
      }
    }
    return {
      name: this.#name,
      command: this.#command,
      git: this.#git ? this.#git.getUrl() : null,
      path: this.#path,
      revision: this.#git ? this.#git.getRevision() : null,
      pid: this.#child ? this.#child.pid : -1,
      startTime: this.#startTime,
      logs,
      status: this.#status,
      code: this.#code,
      env: this.#env,
      enabled: this.#enabled,
    };
  }

  logInfo(message) {
    this.#logger.info(`Task(${this.#name}): ${message}`);
  }

  logError(message) {
    this.#logger.error(`Task(${this.#name}): ${message}`);
  }

  logDebug(message) {
    this.#logger.debug(`Task(${this.#name}): ${message}`);
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
    if (this.#git !== null) {
      this.logInfo(`Initializing git repository...`);
      try {
        const newRepo = await this.#git.init();
        if (newRepo) {
          await this.runCommand('npm ci', true);
        }
      } catch (err) {
        this.logError(`Failed to initialize git repository: ${err.message}`);
        this.updateStatus('STOPPED');
        this.#code = -1;
        return;
      }
    }
    if (this.#child !== null) {
      kill(this.#child.pid);
      this.#child = null;
    }
    if (!existsSync(this.#path)) {
      this.logError(`Directory "${this.#path}" does not exist.`);
      this.updateStatus('STOPPED');
      this.#code = 'ENOENT';
      return;
    }
    this.logInfo(`Running "${this.#command}" in "${this.#path}"...`);
    const child = await this.runCommand(this.#command, false);

    child.on('error', (err) => {
      this.logError(`Process error: ${err.message}`);
      if (this.#pollUpdatesTimeout != null) {
        clearTimeout(this.#pollUpdatesTimeout);
        this.#pollUpdatesTimeout = null;
      }
      this.updateStatus('STOPPED');
      this.#code = err.code || -1;
      this.#child = null;
    });

    child.on('exit', (code, signal) => {
      if (this.#child !== null) {
        this.logInfo(`Process "${this.#child.pid}" terminated with ` +
          `code=${code} signal=${signal}.`);
        this.updateStatus('STOPPED');
        this.#code = code !== null ? code : signal;
        this.#child = null;
      }
    });

    if (!child.pid) {
      this.logError(`Child process failed to launch (pid is undefined).`);
      this.updateStatus('STOPPED');
      this.#code = -1;
      return;
    }

    this.#child = child;
    this.logInfo(`Child process launched with pid="${this.#child.pid}"`);
    this.updateStatus('RUNNING');
    this.#startTime = new Date();
    this.schedulePollUpdates();
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
    return new Promise((resolveFunc) => {
      if (this.#child === null ||
          this.#child.exitCode !== null ||
          this.#child.signalCode !== null) {
        this.#child = null;
        this.updateStatus('STOPPED');
        resolveFunc();
        return;
      }

      const pid = this.#child.pid;
      let resolved = false;

      const finish = (code, signal) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(killTimer);
        clearTimeout(safetyTimer);
        if (this.#child !== null) {
          this.logInfo(`Process "${pid}" terminated with ` +
            `code=${code} signal=${signal}.`);
          this.#child = null;
          this.updateStatus('STOPPED');
          this.#code = code !== null ? code : signal;
        } else {
          this.updateStatus('STOPPED');
        }
        resolveFunc();
      };

      const killTimer = setTimeout(() => {
        if (!resolved && this.#child) {
          this.logInfo(`Process "${pid}" did not exit on SIGTERM; ` +
            `escalating to SIGKILL...`);
          kill(pid, 'SIGKILL', () => {});
        }
      }, 3000);

      const safetyTimer = setTimeout(() => {
        if (!resolved) {
          this.logInfo(`Stop timed out for process "${pid}". Marking STOPPED.`);
          finish(null, 'SIGKILL');
        }
      }, 6000);

      this.#child.once('exit', (code, signal) => {
        finish(code, signal);
      });

      this.logInfo(`Killing process "${pid}"...`);
      kill(pid);
    });
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async runCommand(command, sync) {
    this.logInfo(`Running command "${command}"...`);
    const homeDir = process.env.HOME || os.homedir();
    const taskLogDir = path.join(homeDir, 'logs', this.#name);
    try {
      await fs.mkdir(taskLogDir, {recursive: true});
    } catch (err) {
      // Ignore directory creation error.
    }

    const env = Object.assign(
        {},
        process.env,
        {
          HOME: homeDir,
          USER: process.env.USER || (os.userInfo && os.userInfo().username),
          LOG_DIR: taskLogDir,
        },
        this.#env,
    );

    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.startsWith('~/')) {
        env[key] = path.join(homeDir, value.slice(2));
      }
    }

    const child = spawn(command, {
      cwd: this.#path,
      shell: true,
      env,
    });

    let stdoutStream = null;
    let stderrStream = null;
    try {
      stdoutStream = createWriteStream(
          path.join(taskLogDir, 'stdout.log'), {flags: 'a'});
      stderrStream = createWriteStream(
          path.join(taskLogDir, 'stderr.log'), {flags: 'a'});
    } catch (e) {
      // Ignore stream creation error.
    }

    child.on('error', (err) => {
      this.logError(`Command "${command}" error: ${err.message}`);
      if (stdoutStream) stdoutStream.end();
      if (stderrStream) stderrStream.end();
    });

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        if (stdoutStream) {
          stdoutStream.write(data);
        }
        for (const line of data.toString().split('\n')) {
          if (line) {
            this.logDebug(`${command} > ${line}`);
          }
        }
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        if (stderrStream) {
          stderrStream.write(data);
        }
        for (const line of data.toString().split('\n')) {
          if (line) {
            this.logInfo(`${command} > ${line}`);
          }
        }
      });
    }
    child.on('exit', () => {
      if (stdoutStream) stdoutStream.end();
      if (stderrStream) stderrStream.end();
    });

    if (!sync) {
      return child;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
      child.on('exit', (code, signal) => {
        if (settled) return;
        settled = true;
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

  schedulePollUpdates() {
    if (this.#git !== null &&
        this.#pollUpdatesInterval > 0 &&
        this.#status === 'RUNNING' &&
        this.#pollUpdatesTimeout === null) {
      this.#pollUpdatesTimeout = setTimeout(async () => {
        this.#pollUpdatesTimeout = null;
        await this.pollUpdates();
      }, this.#pollUpdatesInterval);
    }
  }

  async pollUpdates() {
    if (this.#git === null) {
      return false;
    }
    if (this.#pollUpdatesTimeout !== null) {
      clearTimeout(this.#pollUpdatesTimeout);
      this.#pollUpdatesTimeout = null;
    }
    try {
      const updated = await this.#git.update();
      this.logInfo(`Poll updates, updated=${updated}.`);
      if (updated) {
        await this.stop();
        try {
          await this.runCommand('npm ci', true);
        } catch (err) {
          this.logInfo(`npm ci failed: ${err.message}`);
        }
        await this.start();
      } else {
        this.schedulePollUpdates();
      }
      return Boolean(updated);
    } catch (err) {
      this.logError(`Poll updates failed: ${err.message}`);
      this.schedulePollUpdates();
      return false;
    }
  }

  async getLogs() {
    const logs = {};
    const homeDir = process.env.HOME || os.homedir();
    const dirs = [
      path.join(homeDir, 'logs', this.#name),
      this.#path,
    ].filter(Boolean);

    for (const dir of dirs) {
      try {
        const files = await glob(path.join(dir, '*.log'));
        for (const file of files) {
          const basename = path.basename(file);
          if (!logs[basename]) {
            logs[basename] = await fs.readFile(file, 'utf-8');
          }
        }
      } catch (err) {
        this.logDebug(`Error reading logs from ${dir}: ${err.message}`);
      }
    }
    return logs;
  }

  async getLogFiles() {
    const homeDir = process.env.HOME || os.homedir();
    const dirs = [
      path.join(homeDir, 'logs', this.#name),
      this.#path,
    ].filter(Boolean);

    const logFileSet = new Set();
    for (const dir of dirs) {
      try {
        const files = await glob(path.join(dir, '*.log'));
        for (const file of files) {
          logFileSet.add(path.basename(file));
        }
      } catch (err) {
        this.logDebug(`Error finding logs in ${dir}: ${err.message}`);
      }
    }
    return Array.from(logFileSet);
  }

  async getLogContent(filename, options = {}) {
    if (!filename || typeof filename !== 'string') {
      return null;
    }
    const safeName = path.basename(filename);
    if (safeName !== filename || filename.includes('..')) {
      throw new Error('Invalid log filename.');
    }

    const homeDir = process.env.HOME || os.homedir();
    const dirs = [
      path.join(homeDir, 'logs', this.#name),
      this.#path,
    ].filter(Boolean);

    for (const dir of dirs) {
      const fullPath = path.join(dir, safeName);
      if (existsSync(fullPath)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          const totalLines = lines.filter(Boolean).length;
          if (options.tail && options.tail > 0) {
            const tailLines = lines.slice(-options.tail);
            return {
              filename: safeName,
              content: tailLines.join('\n'),
              totalLines,
            };
          }
          return {
            filename: safeName,
            content,
            totalLines,
          };
        } catch (err) {
          this.logDebug(`Error reading log file ${fullPath}: ${err.message}`);
        }
      }
    }
    return null;
  }
}

module.exports = Task;
