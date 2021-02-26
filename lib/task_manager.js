const Task = require('./task');
const Git = require('./git');

class TaskManager {
  #tasks = {};

  loadFromConfig(config) {
    const workspace = config.workspace;
    for (const taskConfig of config.tasks) {
      this.addTask(workspace, taskConfig, config.pollUpdatesInterval);
    }
  }

  async addTask(workspace, config, pollUpdatesInterval) {
    const git = new Git(workspace, config.git.url);
    const task = new Task(config, git, pollUpdatesInterval);
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
