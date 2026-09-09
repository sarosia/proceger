const Task = require('./task');
const Git = require('./git');

class TaskManager {
  #tasks = {};
  #logger = null;

  constructor(logger = null) {
    this.#logger = logger;
  }

  loadFromConfig(config, logger = null) {
    if (logger) {
      this.#logger = logger;
    }
    const workspace = config.workspace;
    for (const taskConfig of config.tasks || []) {
      this.addTask(workspace, taskConfig, config.pollUpdatesInterval);
    }
  }

  async addTask(workspace, config, pollUpdatesInterval) {
    const git = new Git(workspace, config.git.url, this.#logger);
    const task = new Task(config, git, pollUpdatesInterval, this.#logger);
    this.#tasks[task.getName()] = task;
    await task.start();
    await task.pollUpdates();
  }

  getTask(name) {
    return this.#tasks[name];
  }

  getAllTasks() {
    return Object.values(this.#tasks);
  }
}

module.exports = TaskManager;
