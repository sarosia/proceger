const Task = require('./task');
const Git = require('./git');
const TaskStore = require('./task_store');

class TaskManager {
  #tasks = {};
  #logger = null;
  #workspace = null;
  #pollUpdatesInterval = 5 * 60 * 1000;
  #globalEnv = {};
  #taskStore = null;

  constructor(logger = null, taskStore = null) {
    this.#logger = logger;
    this.#taskStore = taskStore;
  }

  getStore() {
    return this.#taskStore;
  }

  setStore(store) {
    this.#taskStore = store;
  }

  async loadFromConfig(config, logger = null) {
    if (logger) {
      this.#logger = logger;
    }
    this.#workspace = config.workspace || process.cwd();
    this.#pollUpdatesInterval = config.pollUpdatesInterval || 5 * 60 * 1000;
    this.#globalEnv = config.env || {};

    if (!this.#taskStore) {
      this.#taskStore = new TaskStore({
        storagePath:
          config.dbPath || config.storagePath || config.notabledbPath,
        url: config.notabledbUrl,
      });
    }

    await this.#taskStore.init(config.tasks || []);
    const storedTasks = await this.#taskStore.listTasks();
    for (const taskConfig of storedTasks) {
      const mergedConfig = Object.assign({}, taskConfig, {
        command: taskConfig.command || 'npm start',
        env: Object.assign({}, this.#globalEnv, taskConfig.env || {}),
      });
      await this.startTask(
          this.#workspace,
          mergedConfig,
          this.#pollUpdatesInterval,
      );
    }
  }

  async startTask(workspace, config, pollUpdatesInterval) {
    const ws = workspace || this.#workspace || process.cwd();
    const interval = pollUpdatesInterval || this.#pollUpdatesInterval;
    const gitUrl = typeof config.git === 'string' ?
      config.git :
      (config.git && config.git.url ? config.git.url : '');
    const git = new Git(ws, gitUrl, this.#logger);
    const task = new Task(config, git, interval, this.#logger);
    this.#tasks[task.getName()] = task;
    await task.start();
    await task.pollUpdates();
    return task;
  }

  async addTask(workspace, config, pollUpdatesInterval) {
    const ws = workspace || this.#workspace || process.cwd();
    const interval = pollUpdatesInterval || this.#pollUpdatesInterval;
    if (this.#taskStore) {
      await this.#taskStore.addTask(config);
    }
    const mergedConfig = Object.assign({}, config, {
      command: config.command || 'npm start',
      env: Object.assign({}, this.#globalEnv, config.env || {}),
    });
    return await this.startTask(ws, mergedConfig, interval);
  }

  async updateTask(name, updates = {}) {
    let storedConfig = null;
    if (this.#taskStore) {
      storedConfig = await this.#taskStore.updateTask(name, updates);
    }
    const task = this.getTask(name);
    if (task) {
      task.updateConfig(updates);
      await task.restart();
      return task;
    }
    if (storedConfig) {
      const mergedConfig = Object.assign({}, storedConfig, {
        command: storedConfig.command || 'npm start',
        env: Object.assign({}, this.#globalEnv, storedConfig.env || {}),
      });
      return await this.startTask(
          this.#workspace,
          mergedConfig,
          this.#pollUpdatesInterval,
      );
    }
    throw new Error(`Task "${name}" not found.`);
  }

  async removeTask(name) {
    const task = this.getTask(name);
    if (task) {
      await task.stop();
      delete this.#tasks[name];
    }
    if (this.#taskStore) {
      await this.#taskStore.removeTask(name);
    }
    return true;
  }

  getTask(name) {
    return this.#tasks[name];
  }

  getAllTasks() {
    return Object.values(this.#tasks);
  }
}

module.exports = TaskManager;
