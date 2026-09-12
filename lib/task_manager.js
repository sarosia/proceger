const Task = require('./task');
const Git = require('./git');
const TaskStore = require('./task_store');

class TaskManager {
  #tasks = {};
  #logger = null;
  #workspace = null;
  #pollUpdatesInterval = 60 * 60 * 1000;
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
    this.#pollUpdatesInterval = config.pollUpdatesInterval || 60 * 60 * 1000;
    this.#globalEnv = config.env || {};

    if (!this.#taskStore) {
      this.#taskStore = new TaskStore({
        storagePath:
          config.dbPath || config.storagePath || config.notabledbPath,
        url: config.notabledbUrl,
      });
    }

    await this.#taskStore.init();
    const storedTasks = await this.#taskStore.listTasks();
    for (const taskConfig of storedTasks) {
      const isEnabled = taskConfig.enabled !== false;
      const mergedConfig = Object.assign({}, taskConfig, {
        command: taskConfig.command || 'npm start',
        env: Object.assign({}, this.#globalEnv, taskConfig.env || {}),
        enabled: isEnabled,
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
    const git = gitUrl ? new Git(ws, gitUrl, this.#logger) : null;
    const task = new Task(config, git, interval, this.#logger);
    this.#tasks[task.getName()] = task;
    if (config.enabled !== false) {
      await task.start();
      if (git !== null) {
        await task.pollUpdates();
      }
    }
    return task;
  }

  async startTaskByName(name) {
    const task = this.getTask(name);
    if (!task) {
      throw new Error(`Task "${name}" not found.`);
    }
    task.setEnabled(true);
    if (this.#taskStore) {
      await this.#taskStore.updateTask(name, {enabled: true});
    }
    await task.start();
    return task;
  }

  async restartTaskByName(name) {
    const task = this.getTask(name);
    if (!task) {
      throw new Error(`Task "${name}" not found.`);
    }
    task.setEnabled(true);
    if (this.#taskStore) {
      await this.#taskStore.updateTask(name, {enabled: true});
    }
    await task.restart();
    return task;
  }

  async stopTaskByName(name) {
    const task = this.getTask(name);
    if (!task) {
      throw new Error(`Task "${name}" not found.`);
    }
    task.setEnabled(false);
    if (this.#taskStore) {
      await this.#taskStore.updateTask(name, {enabled: false});
    }
    await task.stop();
    return task;
  }

  async addTask(workspace, config, pollUpdatesInterval) {
    const ws = workspace || this.#workspace || process.cwd();
    const interval = pollUpdatesInterval || this.#pollUpdatesInterval;
    const taskData = Object.assign({}, config, {
      enabled: config.enabled !== undefined ? Boolean(config.enabled) : true,
    });
    if (this.#taskStore) {
      await this.#taskStore.addTask(taskData);
    }
    const mergedConfig = Object.assign({}, taskData, {
      command: taskData.command || 'npm start',
      env: Object.assign({}, this.#globalEnv, taskData.env || {}),
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
      const gitChanged = updates.git !== undefined;
      const pathChanged =
          updates.path !== undefined || updates.cwd !== undefined;
      if (gitChanged || pathChanged) {
        await task.stop();
        delete this.#tasks[name];
        const baseConfig = storedConfig ||
            Object.assign({}, await task.toJson(), updates);
        const mergedConfig = Object.assign({}, baseConfig, {
          command: baseConfig.command || 'npm start',
          env: Object.assign({}, this.#globalEnv, baseConfig.env || {}),
          enabled: baseConfig.enabled !== undefined ?
            Boolean(baseConfig.enabled) : true,
        });
        return await this.startTask(
            this.#workspace,
            mergedConfig,
            this.#pollUpdatesInterval,
        );
      }
      if (updates.enabled === false) {
        await task.stop();
      } else if (updates.enabled === true && task.getStatus() === 'STOPPED') {
        await task.start();
      } else {
        await task.restart();
      }
      return task;
    }
    if (storedConfig) {
      const mergedConfig = Object.assign({}, storedConfig, {
        command: storedConfig.command || 'npm start',
        env: Object.assign({}, this.#globalEnv, storedConfig.env || {}),
        enabled: storedConfig.enabled !== undefined ?
          Boolean(storedConfig.enabled) : true,
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
