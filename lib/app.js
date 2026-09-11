const path = require('path');
const Apper = require('@sarosia/apper');
const TaskManager = require('./task_manager');

/**
 * Creates and configures an Apper application for Proceger.
 * @param {TaskManager} [taskManager] Optional task manager instance.
 * @param {Object} [configOverrides={}] Optional configuration overrides.
 * @return {Apper} Configured Apper application instance.
 */
function createApp(taskManager = new TaskManager(), configOverrides = {}) {
  const defaultConfig = Object.assign({
    port: 8080,
    appName: 'Proceger',
    pollUpdatesInterval: 5 * 60 * 1000,
    staticPaths: [
      path.resolve(__dirname, '../static'),
    ],
    auth: {
      enabled: true,
      cookieName: 'proceger_session',
      allowedEmails: [],
    },
  }, configOverrides);

  const appName = configOverrides.name ||
      (process.env.NODE_ENV === 'test' ? 'proceger-test' : 'proceger');

  const app = new Apper(appName, (ctx) => {
    ctx.taskManager = taskManager;
  }, defaultConfig);

  app.getExpress().set('trust proxy', true);

  app.get('/task/list', async (ctx, req, res) => {
    const tasks = [];
    for (const task of taskManager.getAllTasks()) {
      tasks.push(await task.toJson());
    }
    res.send(tasks);
  });

  app.get('/task/:name/restart', async (ctx, req, res) => {
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send('Task not found');
    }
    try {
      await task.restart();
      res.send('OK');
    } catch (err) {
      ctx.logger.error(
          `Failed to restart task "${req.params.name}": ${err.message}`,
      );
      res.status(500).send(`Failed to restart: ${err.message}`);
    }
  });

  app.get('/task/:name/stop', async (ctx, req, res) => {
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send('Task not found');
    }
    try {
      await task.stop();
      res.send('OK');
    } catch (err) {
      ctx.logger.error(
          `Failed to stop task "${req.params.name}": ${err.message}`,
      );
      res.status(500).send(`Failed to stop: ${err.message}`);
    }
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

