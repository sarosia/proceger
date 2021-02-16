const Task = require('./task');
const Git = require('./git');

class TaskManager {
  #tasks = {};

  async loadFromConfig(config) {
    const workspace = config.workspace;
    for (const taskConfig of config.tasks) {
      await this.addTask(workspace, taskConfig, config.pollUpdatesInterval);
    }
  }

  async addTask(workspace, config, pollUpdatesInterval) {
    const git = new Git(workspace, config.git.url);
    const task = new Task(config, git, pollUpdatesInterval);
    await task.start();
    this.#tasks[task.getName()] = task;
  }

  getTask(name) {
    return this.#tasks[name];
  }

  getAllTasks() {
    return Object.values(this.#tasks);
  }
}

module.exports = TaskManager;
