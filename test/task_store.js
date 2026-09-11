const {expect} = require('chai');
const {Database, InMemoryStorage} = require('@sarosia/notabledb');
const TaskStore = require('../lib/task_store');

describe('TaskStore with notabledb', () => {
  let storage;
  let database;
  let store;

  beforeEach(() => {
    storage = new InMemoryStorage();
    database = new Database(storage);
    store = new TaskStore({database});
  });

  it('initializes empty and seeds initial tasks if provided', async () => {
    expect(await store.listTasks()).to.deep.equal([]);

    const initial = [
      {
        name: 'task-1',
        git: 'git@github.com:example/repo.git',
        command: 'node server.js',
      },
    ];

    await store.init(initial);
    const tasks = await store.listTasks();
    expect(tasks.length).to.equal(1);
    expect(tasks[0].name).to.equal('task-1');
    expect(tasks[0].git.url).to.equal('git@github.com:example/repo.git');
    expect(tasks[0].command).to.equal('node server.js');

    // Subsequent init does not overwrite existing data
    await store.init([
      {name: 'task-2', git: 'git@github.com:example/repo2.git'},
    ]);
    const afterReinit = await store.listTasks();
    expect(afterReinit.length).to.equal(1);
    expect(afterReinit[0].name).to.equal('task-1');
  });

  it('adds a new task with default command fallback', async () => {
    const task = await store.addTask({
      name: 'worker',
      git: 'git@github.com:example/worker.git',
    });

    expect(task.name).to.equal('worker');
    expect(task.command).to.equal('npm start');
    expect(task.git.url).to.equal('git@github.com:example/worker.git');

    const fetched = await store.getTask('worker');
    expect(fetched.name).to.equal('worker');
    expect(fetched.command).to.equal('npm start');
  });

  it('rejects adding task without name or location (git / path)', async () => {
    try {
      await store.addTask({git: 'git@github.com:example/worker.git'});
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e.message).to.include('name is required');
    }

    try {
      await store.addTask({name: 'test'});
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e.message).to.include(
          'Either Git repository URL or local path is required');
    }
  });

  it('adds a task with local path without git', async () => {
    const task = await store.addTask({
      name: 'local-app',
      path: '/tmp/local-app',
      command: 'node index.js',
    });
    expect(task.name).to.equal('local-app');
    expect(task.path).to.equal('/tmp/local-app');
    expect(task.git).to.equal(null);
  });

  it('updates task command and environment', async () => {
    await store.addTask({
      name: 'service',
      git: 'git@github.com:example/service.git',
      command: 'npm start',
    });

    const updated = await store.updateTask('service', {
      command: 'node app.js --prod',
      env: {PORT: '9090'},
    });

    expect(updated.command).to.equal('node app.js --prod');
    expect(updated.env.PORT).to.equal('9090');

    const retrieved = await store.getTask('service');
    expect(retrieved.command).to.equal('node app.js --prod');
  });

  it('removes a task', async () => {
    await store.addTask({
      name: 'temp-service',
      git: 'git@github.com:example/temp.git',
    });

    expect(await store.listTasks()).to.have.lengthOf(1);

    const removed = await store.removeTask('temp-service');
    expect(removed.name).to.equal('temp-service');
    expect(await store.listTasks()).to.have.lengthOf(0);
    expect(await store.getTask('temp-service')).to.be.null;
  });
});
