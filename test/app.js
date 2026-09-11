process.env.NODE_ENV = 'test';
const chai = require('chai');
const sinon = require('sinon');
chai.should();

const {createApp} = require('../lib/app');
const TaskManager = require('../lib/task_manager');

describe('App', function() {
  it('creates an apper application', () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const app = createApp(taskManager);
    app.should.be.an('object');
    app.getExpress.should.be.a('function');
    app.getContext.should.be.a('function');
    app.getContext().taskManager.should.equal(taskManager);
  });

  it('configures auth manager with proceger defaults', () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const app = createApp(taskManager, {
      name: 'proceger',
      auth: {
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
      },
    });
    app.getAuth.should.be.a('function');
    const auth = app.getAuth();
    auth.should.be.an('object');
    auth.isEnabled().should.equal(true);
    auth.getAppName().should.equal('Proceger');
    auth.getCookieName().should.equal('proceger_session');
  });

  it('allows overriding auth configuration', () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const app = createApp(taskManager, {
      auth: {
        enabled: false,
      },
    });
    const auth = app.getAuth();
    auth.isEnabled().should.equal(false);
  });

  it('configures logDir from config and passes to logger', () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const customLogDir = '/tmp/custom-proceger-logs';
    const app = createApp(taskManager, {
      logDir: customLogDir,
    });
    app.getContext().logger.logDir.should.equal(customLogDir);
  });

  it('returns proceger as a system task in /task/list', async () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    taskManager.getAllTasks.returns([]);
    const app = createApp(taskManager, {
      port: 0,
      auth: {enabled: false},
    });
    const server = await app.start();
    const port = server.address().port;
    try {
      const res = await fetch(`http://localhost:${port}/task/list`);
      const tasks = await res.json();
      tasks.should.be.an('array');
      tasks.length.should.equal(1);
      tasks[0].name.should.equal('proceger');
      tasks[0].isSystem.should.equal(true);
      tasks[0].status.should.equal('RUNNING');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
