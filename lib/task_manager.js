const Task = require('./task');
const Git = require('./git');

class TaskManager {
  #tasks = [];

  async loadFromConfig(config) {
    const workspace = config.workspace;
    for (const taskConfig of config.tasks) {
      await this.addTask(workspace, taskConfig);
    }
  }

  async addTask(workspace, config) {
    const task = new Task(config, new Git(workspace, config.git.url));
    await task.start();
    this.#tasks.push(task);
  }

  getAllTasks() {
    return this.#tasks;
  }
}

module.exports = TaskManager;
