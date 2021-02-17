const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
chai.should();

const Task = require('../lib/task');
const Git = require('../lib/git');
const sleep = require('util').promisify(setTimeout);

describe('Task', function() {
  const workspace = path.join(__dirname, 'testdata');
  const repo1Path = path.join(workspace, 'repo1');

  function createGitStub() {
    return sinon.createStubInstance(Git, {
      getUrl: 'git@github.com:sarosia/repo1.git',
      getRepoPath: repo1Path,
      getRevision: null,
      update: Promise.resolve(false),
    });
  }

  it('start then stop', async () => {
    const git = createGitStub();
    const task = new Task({name: 'repo1'}, git, 1000);
    let json = await task.toJson();
    json.should.deep.equal({
      'git': 'git@github.com:sarosia/repo1.git',
      'logs': {
        'stdout.log': 'log1\nlog2\nlog3\n',
        'stderr.log': 'log1\nlog2\nlog3\n',
      },
      'name': 'repo1',
      'path': repo1Path,
      'pid': -1,
      'revision': null,
      'startTime': null,
      'status': 'IDLE',
      'code': null,
    });

    try {
      await task.start();
      json = await task.toJson();
      json.startTime.should.not.equal(null);
      json.pid.should.not.equal(-1);
    } finally {
      await task.stop();
      json = await task.toJson();
      json.startTime.should.not.equal(null);
      delete json['startTime'];
      json.should.deep.equal({
        'git': 'git@github.com:sarosia/repo1.git',
        'logs': {
          'stdout.log': 'log1\nlog2\nlog3\n',
          'stderr.log': 'log1\nlog2\nlog3\n',
        },
        'name': 'repo1',
        'path': repo1Path,
        'pid': -1,
        'revision': null,
        'status': 'STOPPED',
        'code': 'SIGTERM',
      });
    }
  }).timeout(10 * 1000);

  it('stop', async () => {
    const git = createGitStub();
    const task = new Task({name: 'repo1'}, git, 1000);
    await task.stop();
    const json = await task.toJson();
    json.should.deep.equal({
      'git': 'git@github.com:sarosia/repo1.git',
      'logs': {
      'stdout.log': 'log1\nlog2\nlog3\n',
      'stderr.log': 'log1\nlog2\nlog3\n',
      },
      'name': 'repo1',
      'path': repo1Path,
      'pid': -1,
      'revision': null,
      'status': 'IDLE',
      'startTime': null,
      'code': null,
    });
  });

  it('restart', async () => {
    const git = createGitStub();
    const task = new Task({name: 'repo1'}, git, 1000);
    try {
      await task.restart();
      const json = await task.toJson();
      json.startTime.should.not.equal(null);
      json.pid.should.not.equal(-1);
    } finally {
      await task.stop();
    }
  }).timeout(10 * 1000);

  it('start then restart', async () => {
    const git = createGitStub();
    const task = new Task({name: 'repo1'}, git, 1000);
    try {
      await task.start();
      let json = await task.toJson();
      json.startTime.should.not.equal(null);
      json.pid.should.not.equal(-1);
      const oldPid = json.pid;

      // Call restart twice to simulate race condition.
      task.restart();
      await task.restart();

      json = await task.toJson();
      json.startTime.should.not.equal(null);
      json.pid.should.not.equal(-1);
      json.pid.should.not.equal(oldPid);
    } finally {
      await task.stop();
    }
  }).timeout(10 * 1000);

  it('pollUpdates', async () => {
    const git = createGitStub();
    git.update.onCall(0).resolves(false);
    git.update.onCall(1).resolves(false);
    git.update.onCall(2).resolves(true);

    const task = new Task({name: 'repo1'}, git, 1000);
    try {
      await task.start();
      json = await task.toJson();
      git.update.onCall(0).resolves(true);
      json.pid.should.not.equal(-1);
      const oldPid = json.pid;

      await task.pollUpdates();
      await sleep(10 * 1000);
      json = await task.toJson();
      json.pid.should.not.equal(-1);
      json.pid.should.not.equal(oldPid);
    } finally {
      await task.stop();
    }
  }).timeout(60 * 1000);
});
