const Task = require('./task');

class TaskManager {
  #tasks = [];

  async loadFromConfig(config) {
    for (const taskConfig of config.tasks) {
      await this.addTask(taskConfig);
    }
  }

  async addTask(config) {
    const task = new Task(config);
    await task.start();
    this.#tasks.push(task);
  }

  getAllTasks() {
    return this.#tasks;
  }
}

module.exports = TaskManager;
