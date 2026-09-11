const {expect} = require('chai');
const {Database, InMemoryStorage} = require('@sarosia/notabledb');
const TaskManager = require('../lib/task_manager');
const TaskStore = require('../lib/task_store');
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

  it('loads tasks from config into store and starts them', async () => {
    await taskManager.loadFromConfig({
      workspace: '/tmp/test-workspace',
      tasks: [
        {
          name: 'worker',
          git: 'git@github.com:example/worker.git',
          command: 'node worker.js',
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
