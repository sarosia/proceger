const express = require('express');
const serveStatic = require('serve-static');
const TaskManager = require('./task_manager');
const config = require('rc')('proceger', {});
const logger = require('./logger');
const port = 8080;

const taskManager = new TaskManager();

const app = express();
app.use(serveStatic(__dirname + '/../static'));
app.get('/task/list', async (req, res) => {
  const tasks = [];
  for (const task of taskManager.getAllTasks()) {
    tasks.push(await task.toJson());
  }
  res.send(tasks);
});

app.get('/task/stop', (req, res) => {
});

module.exports = async function() {
  await taskManager.loadFromConfig(config);
  app.listen(port);
  logger.info(`Application started at ${port}`);
};
