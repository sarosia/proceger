const path = require('path');
const Apper = require('@sarosia/apper');
const TaskManager = require('./task_manager');

/**
 * Creates and configures an Apper application for Proceger.
 * @param {TaskManager} [taskManager] Optional task manager instance.
 * @return {Apper} Configured Apper application instance.
 */
function createApp(taskManager = new TaskManager()) {
  const app = new Apper('proceger', (ctx) => {
    ctx.taskManager = taskManager;
  }, {
    port: 8080,
    pollUpdatesInterval: 5 * 60 * 1000,
    staticPaths: [
      path.resolve(__dirname, '../static'),
    ],
  });

  app.get('/task/list', async (ctx, req, res) => {
    const tasks = [];
    for (const task of taskManager.getAllTasks()) {
      tasks.push(await task.toJson());
    }
    res.send(tasks);
  });

  app.get('/task/:name/restart', async (ctx, req, res) => {
    const task = taskManager.getTask(req.params.name);
    if (task) {
      await task.restart();
    }
    res.send('OK');
  });

  app.get('/task/:name/stop', async (ctx, req, res) => {
    const task = taskManager.getTask(req.params.name);
    if (task) {
      await task.stop();
    }
    res.send('OK');
  });

  app.onStart((ctx) => {
    taskManager.loadFromConfig(ctx.config, ctx.logger);
  });

  return app;
}

/**
 * Starts the Proceger application.
 * @return {Promise<http.Server>} HTTP server instance.
 */
module.exports = async function() {
  const app = createApp();
  return await app.start();
};
module.exports.createApp = createApp;

