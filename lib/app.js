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

  let initPromise = null;
  const ensureInit = (config, logger) => {
    if (!initPromise) {
      initPromise = taskManager.loadFromConfig(config, logger);
    }
    return initPromise;
  };

  app.get('/task/list', async (ctx, req, res) => {
    await ensureInit(ctx.config, ctx.logger);
    const tasks = [];
    for (const task of taskManager.getAllTasks()) {
      tasks.push(await task.toJson());
    }
    res.send(tasks);
  });

  app.get('/task/:name', async (ctx, req, res) => {
    await ensureInit(ctx.config, ctx.logger);
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send({error: 'Task not found'});
    }
    res.send(await task.toJson());
  });

  app.post('/task', async (ctx, req, res) => {
    await ensureInit(ctx.config, ctx.logger);
    const body = req.body || {};
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return res.status(400).send({error: 'Task name is required.'});
    }
    const gitUrl = typeof body.git === 'string' ?
      body.git :
      (body.git && body.git.url ? body.git.url : '');
    if (!gitUrl || !gitUrl.trim()) {
      return res.status(400).send({error: 'Git repository URL is required.'});
    }
    try {
      const task = await taskManager.addTask(
          ctx.config.workspace,
          {
            name: body.name.trim(),
            git: {url: gitUrl.trim()},
            command: (body.command && body.command.trim()) || 'npm start',
            env: body.env || {},
          },
          ctx.config.pollUpdatesInterval,
      );
      res.status(201).send({
        status: 'OK',
        task: await task.toJson(),
      });
    } catch (err) {
      ctx.logger.error(`Failed to add task: ${err.message}`);
      res.status(500).send({error: err.message});
    }
  });

  app.put('/task/:name', async (ctx, req, res) => {
    await ensureInit(ctx.config, ctx.logger);
    const body = req.body || {};
    try {
      const task = await taskManager.updateTask(req.params.name, body);
      res.send({
        status: 'OK',
        task: await task.toJson(),
      });
    } catch (err) {
      ctx.logger.error(
          `Failed to update task "${req.params.name}": ${err.message}`,
      );
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).send({error: err.message});
    }
  });

  app.delete('/task/:name', async (ctx, req, res) => {
    await ensureInit(ctx.config, ctx.logger);
    try {
      await taskManager.removeTask(req.params.name);
      res.send({
        status: 'OK',
        message: `Task "${req.params.name}" removed.`,
      });
    } catch (err) {
      ctx.logger.error(
          `Failed to remove task "${req.params.name}": ${err.message}`,
      );
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).send({error: err.message});
    }
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

  app.get('/task/:name/start', async (ctx, req, res) => {
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send('Task not found');
    }
    try {
      await task.start();
      res.send('OK');
    } catch (err) {
      ctx.logger.error(
          `Failed to start task "${req.params.name}": ${err.message}`,
      );
      res.status(500).send(`Failed to start: ${err.message}`);
    }
  });

  app.onStart(async (ctx) => {
    await ensureInit(ctx.config, ctx.logger);
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
