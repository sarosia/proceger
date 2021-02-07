const Task = require('./task');

class TaskManager {
  #tasks = [];

  async loadFromConfig(config) {
    const workspace = config.workspace;
    for (const taskConfig of config.tasks) {
      await this.addTask(workspace, taskConfig);
    }
  }

  async addTask(workspace, config) {
    const task = new Task(workspace, config);
    await task.start();
    this.#tasks.push(task);
  }

  getAllTasks() {
    return this.#tasks;
  }
}

module.exports = TaskManager;
