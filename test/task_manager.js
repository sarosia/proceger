const {expect} = require('chai');
const {Database, InMemoryStorage} = require('@sarosia/notabledb');
const TaskManager = require('../lib/task_manager');
const TaskStore = require('../lib/task_store');
const Task = require('../lib/task');
const sinon = require('sinon');

describe('TaskManager with TaskStore', () => {
  let storage;
  let database;
  let store;
  let taskManager;

  beforeEach(() => {
    storage = new InMemoryStorage();
    database = new Database(storage);
    store = new TaskStore({database});
    taskManager = new TaskManager(null, store);
    sinon.stub(taskManager, 'startTask').callsFake(async (ws, config) => {
      const stubTask = {
        getName: () => config.name,
        getCommand: () => config.command,
        updateConfig: sinon.spy(),
        restart: sinon.stub().resolves(),
        stop: sinon.stub().resolves(),
        toJson: async () => ({name: config.name, command: config.command}),
      };
      return stubTask;
    });
  });

  it('loads tasks from notabledb store and ignores tasks in config',
      async () => {
        await store.addTask({
          name: 'worker',
          git: 'git@github.com:example/worker.git',
          command: 'node worker.js',
        });

        await taskManager.loadFromConfig({
          workspace: '/tmp/test-workspace',
          tasks: [
            {
              name: 'ignored-task',
              git: 'git@github.com:example/ignored.git',
              command: 'node ignored.js',
            },
          ],
        });

        const stored = await store.listTasks();
        expect(stored).to.have.lengthOf(1);
        expect(stored[0].name).to.equal('worker');
        expect(stored[0].command).to.equal('node worker.js');
      });

  it('updates task command in notabledb store', async () => {
    await store.addTask({
      name: 'worker',
      git: 'git@github.com:example/worker.git',
      command: 'npm start',
    });

    await taskManager.updateTask('worker', {
      command: 'node custom_worker.js',
    });

    const stored = await store.getTask('worker');
    expect(stored.command).to.equal('node custom_worker.js');
  });

  it('removes task from notabledb store', async () => {
    await store.addTask({
      name: 'worker',
      git: 'git@github.com:example/worker.git',
    });

    expect(await store.listTasks()).to.have.lengthOf(1);
    await taskManager.removeTask('worker');
    expect(await store.listTasks()).to.have.lengthOf(0);
  });
});

describe('TaskManager with real Task and TaskStore', () => {
  let storage;
  let database;
  let store;
  let taskManager;
  let startStub;
  let stopStub;

  beforeEach(() => {
    storage = new InMemoryStorage();
    database = new Database(storage);
    store = new TaskStore({database});
    taskManager = new TaskManager(null, store);
    startStub = sinon.stub(Task.prototype, 'start').resolves();
    stopStub = sinon.stub(Task.prototype, 'stop').resolves();
  });

  afterEach(() => {
    startStub.restore();
    stopStub.restore();
  });

  it('only starts enabled tasks on loadFromConfig', async () => {
    await store.addTask({
      name: 'task-enabled',
      path: '/tmp',
      enabled: true,
    });
    await store.addTask({
      name: 'task-disabled',
      path: '/tmp',
      enabled: false,
    });

    await taskManager.loadFromConfig({workspace: '/tmp'});

    expect(taskManager.getTask('task-enabled')).to.exist;
    expect(taskManager.getTask('task-disabled')).to.exist;
    expect(taskManager.getTask('task-enabled').isEnabled()).to.be.true;
    expect(taskManager.getTask('task-disabled').isEnabled()).to.be.false;
    expect(taskManager.getTask('task-disabled').getStatus())
        .to.equal('STOPPED');

    // Task.prototype.start should only have been called for task-enabled
    expect(startStub.calledOnce).to.be.true;
  });

  it('stopTaskByName stops task and persists enabled: false in store',
      async () => {
        await taskManager.addTask('/tmp', {
          name: 'worker',
          path: '/tmp',
          enabled: true,
        });

        await taskManager.stopTaskByName('worker');

        expect(stopStub.called).to.be.true;
        expect(taskManager.getTask('worker').isEnabled()).to.be.false;
        const stored = await store.getTask('worker');
        expect(stored.enabled).to.equal(false);
      });

  it('startTaskByName and restartTaskByName persist enabled: true',
      async () => {
        await store.addTask({
          name: 'worker',
          path: '/tmp',
          enabled: false,
        });
        await taskManager.loadFromConfig({workspace: '/tmp'});

        await taskManager.startTaskByName('worker');

        expect(taskManager.getTask('worker').isEnabled()).to.be.true;
        const stored = await store.getTask('worker');
        expect(stored.enabled).to.equal(true);

        await taskManager.stopTaskByName('worker');
        expect((await store.getTask('worker')).enabled).to.equal(false);

        await taskManager.restartTaskByName('worker');
        expect((await store.getTask('worker')).enabled).to.equal(true);
      });
});
