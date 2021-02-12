const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
chai.should();

const Task = require('../lib/task');
const Git = require('../lib/git');

describe('Task', () => {
  const workspace = path.join(__dirname, 'testdata');
  const repo1Path = path.join(workspace, 'repo1');
  const git = sinon.createStubInstance(Git, {
    getUrl: 'git@github.com:sarosia/repo1.git',
    getRepoPath: repo1Path,
    getRevision: null,
    update: Promise.resolve(false),
  });

  it('start then stop', async () => {
    const task = new Task({name: 'repo1'}, git);
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
  });

  it('restart', async () => {
    const task = new Task({name: 'repo1'}, git);
    try {
      await task.start();
      let json = await task.toJson();
      json.startTime.should.not.equal(null);
      json.pid.should.not.equal(-1);
      const oldPid = json.pid;

      await task.restart();
      json = await task.toJson();
      json.startTime.should.not.equal(null);
      json.pid.should.not.equal(-1);
      json.pid.should.not.equal(oldPid);
    } finally {
      await task.stop();
    }
  });
});
