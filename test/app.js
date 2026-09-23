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

  it('triggers pollUpdates on /task/:name/poll', async () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const mockTask = {
      getName: () => 'my-task',
      pollUpdates: sinon.stub().resolves(true),
    };
    taskManager.getTask.withArgs('my-task').returns(mockTask);
    const app = createApp(taskManager, {
      port: 0,
      auth: {enabled: false},
    });
    const server = await app.start();
    const port = server.address().port;
    try {
      const res = await fetch(`http://localhost:${port}/task/my-task/poll`);
      const body = await res.json();
      body.status.should.equal('OK');
      body.updated.should.equal(true);
      mockTask.pollUpdates.calledOnce.should.equal(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('serves task log content via /task/:name/log/:filename', async () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const mockTask = {
      getName: () => 'my-task',
      getLogContent: sinon.stub().resolves({
        filename: 'stdout.log',
        content: 'line 1\nline 2\n',
        totalLines: 2,
      }),
    };
    taskManager.getTask.withArgs('my-task').returns(mockTask);
    const app = createApp(taskManager, {
      port: 0,
      auth: {enabled: false},
    });
    const server = await app.start();
    const port = server.address().port;
    try {
      const res = await fetch(
          `http://localhost:${port}/task/my-task/log/stdout.log?tail=5`,
      );
      res.status.should.equal(200);
      const data = await res.json();
      data.filename.should.equal('stdout.log');
      data.totalLines.should.equal(2);
      mockTask.getLogContent.calledWith('stdout.log', {tail: 5})
          .should.equal(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns 404 when log file is not found', async () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const mockTask = {
      getName: () => 'my-task',
      getLogContent: sinon.stub().resolves(null),
    };
    taskManager.getTask.withArgs('my-task').returns(mockTask);
    const app = createApp(taskManager, {
      port: 0,
      auth: {enabled: false},
    });
    const server = await app.start();
    const port = server.address().port;
    try {
      const res = await fetch(
          `http://localhost:${port}/task/my-task/log/unknown.log`,
      );
      res.status.should.equal(404);
    } finally {
      await app.stop();
    }
  });

  it('stops all tasks on app.stop()', async () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    taskManager.stopAllTasks = sinon.stub().resolves();
    const app = createApp(taskManager, {
      port: 0,
      auth: {enabled: false},
    });
    await app.start();
    await app.stop();
    taskManager.stopAllTasks.calledOnce.should.equal(true);
  });

  it('does not create adminServer when adminPort is not specified', () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const app = createApp(taskManager);
    chai.expect(app.getAdminServer()).to.be.null;
    chai.expect(app.getAdminPort()).to.be.null;
  });

  it('serves unauthenticated requests on adminPort while main port ' +
     'requires auth', async () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    taskManager.getAllTasks.returns([]);
    const app = createApp(taskManager, {
      port: 0,
      adminPort: 0,
      auth: {
        enabled: true,
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
      },
    });
    const server = await app.start();
    const mainPort = server.address().port;
    const adminPort = app.getAdminPort();
    adminPort.should.be.a('number');
    adminPort.should.not.equal(mainPort);
    chai.expect(app.getAdminServer()).to.not.be.null;

    try {
      // Main port with auth enabled should redirect or return 302/401
      const mainRes = await fetch(`http://localhost:${mainPort}/task/list`, {
        redirect: 'manual',
      });
      (mainRes.status === 302 || mainRes.status === 401).should.equal(true);

      // Admin port should serve /task/list without auth (200 OK)
      const adminRes = await fetch(`http://localhost:${adminPort}/task/list`);
      adminRes.status.should.equal(200);
      const tasks = await adminRes.json();
      tasks.should.be.an('array');
      tasks.length.should.equal(1);
      tasks[0].name.should.equal('proceger');

      // Admin port /auth/me returns unauthenticated
      const meRes = await fetch(`http://localhost:${adminPort}/auth/me`);
      const meBody = await meRes.json();
      meBody.authenticated.should.equal(false);

      // Admin port /auth/config returns enabled: false
      const configRes = await fetch(
          `http://localhost:${adminPort}/auth/config`,
      );
      const configBody = await configRes.json();
      configBody.enabled.should.equal(false);
    } finally {
      await app.stop();
      chai.expect(app.getAdminServer()).to.be.null;
    }
  });

  it('restarts task via adminPort without auth', async () => {
    const taskManager = sinon.createStubInstance(TaskManager);
    const mockTask = {
      getName: () => 'test-task',
    };
    taskManager.getTask.withArgs('test-task').returns(mockTask);
    taskManager.restartTaskByName = sinon.stub().resolves();
    const app = createApp(taskManager, {
      port: 0,
      adminPort: 0,
      auth: {
        enabled: true,
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
      },
    });
    await app.start();
    const adminPort = app.getAdminPort();

    try {
      const res = await fetch(
          `http://localhost:${adminPort}/task/test-task/restart`,
      );
      res.status.should.equal(200);
      const body = await res.text();
      body.should.equal('OK');
      taskManager.restartTaskByName.calledWith('test-task')
          .should.equal(true);
    } finally {
      await app.stop();
    }
  });
});
