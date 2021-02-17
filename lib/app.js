const express = require('express');
const serveStatic = require('serve-static');
const TaskManager = require('./task_manager');
const config = require('rc')('proceger', {
  pollUpdatesInterval: 5 * 60 * 1000,
});
const logger = require('./logger');
const port = config.port;

const taskManager = new TaskManager();

const app = express();
app.use(serveStatic(__dirname + '/../static'));
app.use(serveStatic(__dirname + '/../node_modules/uikit/dist'));
app.get('/task/list', async (req, res) => {
  const tasks = [];
  for (const task of taskManager.getAllTasks()) {
    tasks.push(await task.toJson());
  }
  res.send(tasks);
});

app.get('/task/:name/restart', async (req, res) => {
  const task = taskManager.getTask(req.params.name);
  if (task) {
    await task.restart();
  }
  res.send('OK');
});

app.get('/task/:name/stop', async (req, res) => {
  const task = taskManager.getTask(req.params.name);
  if (task) {
    await task.stop();
  }
  res.send('OK');
});

module.exports = async function() {
  await taskManager.loadFromConfig(config);
  app.listen(port);
  logger.info(`Application started at ${port}`);
};
