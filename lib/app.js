const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const glob = require('glob-promise');
const Apper = require('@sarosia/apper');
const TaskManager = require('./task_manager');

const appStartTime = new Date();

/**
 * Retrieves status and logs for the Proceger application itself.
 * @param {Object} ctx Apper request context.
 * @return {Promise<Object>} Proceger task information.
 */
async function getProcegerInfo(ctx) {
  const homeDir = process.env.HOME || os.homedir();
  const logDir = (ctx && ctx.logger && ctx.logger.logDir) ||
    (ctx && ctx.config && (ctx.config.logDir || ctx.config.logdir)) ||
    path.join(homeDir, 'logs', 'proceger');
  const logs = {};
  if (logDir) {
    try {
      const patterns = [
        path.join(logDir, '*.log'),
        path.join(homeDir, 'logs', 'proceger', '*.log'),
      ];
      for (const pattern of patterns) {
        const files = await glob(pattern);
        for (const file of files) {
          const base = path.basename(file);
          if (!logs[base]) {
            logs[base] = await fs.readFile(file, 'utf-8');
          }
        }
      }
    } catch (err) {
      if (ctx && ctx.logger) {
        ctx.logger.debug(`Error reading proceger logs: ${err.message}`);
      }
    }
  }

  const appDir = path.resolve(__dirname, '..');
  const scriptPath = process.argv[1] ?
    path.relative(process.cwd(), process.argv[1]) : 'index.js';

  return {
    name: 'proceger',
    command: `node ${scriptPath || 'index.js'}`,
    git: null,
    path: appDir,
    revision: null,
    pid: process.pid,
    startTime: appStartTime,
    logs,
    status: 'RUNNING',
    code: null,
    env: {},
    isSystem: true,
  };
}

/**
 * Creates and configures an Apper application for Proceger.
 * @param {TaskManager} [taskManager] Optional task manager instance.
 * @param {Object} [configOverrides={}] Optional configuration overrides.
 * @return {Apper} Configured Apper application instance.
 */
function createApp(taskManager = new TaskManager(), configOverrides = {}) {
  const homeDir = process.env.HOME || os.homedir();
  const defaultLogDir = path.join(homeDir, 'logs', 'proceger');
  const defaultConfig = Object.assign({
    port: 8080,
    appName: 'Proceger',
    logDir: defaultLogDir,
    pollUpdatesInterval: 60 * 60 * 1000,
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
    tasks.push(await getProcegerInfo(ctx));
    for (const task of taskManager.getAllTasks()) {
      tasks.push(await task.toJson());
    }
    res.send(tasks);
  });

  app.get('/task/:name', async (ctx, req, res) => {
    await ensureInit(ctx.config, ctx.logger);
    if (req.params.name === 'proceger') {
      return res.send(await getProcegerInfo(ctx));
    }
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
    if (body.name.trim().toLowerCase() === 'proceger') {
      return res.status(400).send({error: 'Task name "proceger" is reserved.'});
    }
    const gitUrl = typeof body.git === 'string' ?
      body.git :
      (body.git && body.git.url ? body.git.url : '');
    const taskPath = body.path || body.cwd || '';
    if ((!gitUrl || !gitUrl.trim()) && (!taskPath || !taskPath.trim())) {
      return res.status(400).send({
        error: 'Either Git repository URL or local path is required.',
      });
    }
    try {
      const task = await taskManager.addTask(
          ctx.config.workspace,
          {
            name: body.name.trim(),
            git: gitUrl && gitUrl.trim() ? {url: gitUrl.trim()} : null,
            path: taskPath && taskPath.trim() ? taskPath.trim() : null,
            command: (body.command && body.command.trim()) || 'npm start',
            env: body.env || {},
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
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
    if (req.params.name === 'proceger') {
      return res.status(400).send({
        error: 'Cannot modify system task "proceger".',
      });
    }
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
    if (req.params.name === 'proceger') {
      return res.status(400).send({
        error: 'Cannot delete system task "proceger".',
      });
    }
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
    if (req.params.name === 'proceger') {
      return res.status(400).send(
          'Cannot restart system task "proceger" from web UI.',
      );
    }
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send('Task not found');
    }
    try {
      await taskManager.restartTaskByName(req.params.name);
      res.send('OK');
    } catch (err) {
      ctx.logger.error(
          `Failed to restart task "${req.params.name}": ${err.message}`,
      );
      res.status(500).send(`Failed to restart: ${err.message}`);
    }
  });

  app.get('/task/:name/stop', async (ctx, req, res) => {
    if (req.params.name === 'proceger') {
      return res.status(400).send(
          'Cannot stop system task "proceger" from web UI.',
      );
    }
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send('Task not found');
    }
    try {
      await taskManager.stopTaskByName(req.params.name);
      res.send('OK');
    } catch (err) {
      ctx.logger.error(
          `Failed to stop task "${req.params.name}": ${err.message}`,
      );
      res.status(500).send(`Failed to stop: ${err.message}`);
    }
  });

  app.get('/task/:name/start', async (ctx, req, res) => {
    if (req.params.name === 'proceger') {
      return res.status(400).send(
          'System task "proceger" is already running.',
      );
    }
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send('Task not found');
    }
    try {
      await taskManager.startTaskByName(req.params.name);
      res.send('OK');
    } catch (err) {
      ctx.logger.error(
          `Failed to start task "${req.params.name}": ${err.message}`,
      );
      res.status(500).send(`Failed to start: ${err.message}`);
    }
  });

  app.get('/task/:name/poll', async (ctx, req, res) => {
    if (req.params.name === 'proceger') {
      return res.status(400).send({
        error: 'System task "proceger" does not support git polling.',
      });
    }
    const task = taskManager.getTask(req.params.name);
    if (!task) {
      return res.status(404).send({error: 'Task not found'});
    }
    try {
      const updated = await task.pollUpdates();
      res.send({
        status: 'OK',
        updated: Boolean(updated),
        message: updated ?
          `Updates pulled and task "${task.getName()}" restarted.` :
          `Task "${task.getName()}" is already up to date.`,
      });
    } catch (err) {
      ctx.logger.error(
          `Failed to poll updates for task "${req.params.name}": ` +
          `${err.message}`,
      );
      res.status(500).send({error: `Failed to poll updates: ${err.message}`});
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
