const fs = require('fs/promises');
const os = require('os');
const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
chai.should();
const {expect} = chai;

const Task = require('../lib/task');
const Git = require('../lib/git');
const sleep = require('util').promisify(setTimeout);

describe('Task', function() {
  const workspace = path.join(__dirname, 'testdata');
  const repo1Path = path.join(workspace, 'repo1');
  const homeDir = process.env.HOME || os.homedir();
  const repo1LogDir = path.join(homeDir, 'logs', 'repo1');
  const local1LogDir = path.join(homeDir, 'logs', 'local1');

  beforeEach(async () => {
    await fs.rm(repo1LogDir, {recursive: true, force: true});
    await fs.rm(local1LogDir, {recursive: true, force: true});
    await fs.writeFile(
        path.join(repo1Path, 'stdout.log'),
        'log1\nlog2\nlog3\n',
    );
    await fs.writeFile(
        path.join(repo1Path, 'stderr.log'),
        'log1\nlog2\nlog3\n',
    );
  });

  afterEach(async () => {
    await fs.rm(repo1LogDir, {recursive: true, force: true});
    await fs.rm(local1LogDir, {recursive: true, force: true});
    await fs.writeFile(
        path.join(repo1Path, 'stdout.log'),
        'log1\nlog2\nlog3\n',
    );
    await fs.writeFile(
        path.join(repo1Path, 'stderr.log'),
        'log1\nlog2\nlog3\n',
    );
  });

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
      'command': 'npm start',
      'env': {},
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
      'enabled': true,
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
        'command': 'npm start',
        'env': {},
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
        'enabled': true,
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
      'command': 'npm start',
      'env': {},
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
      'enabled': true,
    });
  });

  it('supports initializing disabled task', async () => {
    const git = createGitStub();
    const task = new Task({name: 'repo1', enabled: false}, git, 1000);
    expect(task.isEnabled()).to.be.false;
    expect(task.getStatus()).to.equal('STOPPED');
    const json = await task.toJson();
    expect(json.enabled).to.be.false;
    expect(json.status).to.equal('STOPPED');
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

  it('runs command with configured environment and HOME', async () => {
    const git = createGitStub();
    const task = new Task({
      name: 'repo1',
      env: {
        CUSTOM_VAR: 'custom_value',
        EXPANDED_PATH: '~/test-dir',
      },
    }, git, 1000);
    const exitCode = await task.runCommand(
        'node -e "if (!process.env.HOME || ' +
        'process.env.CUSTOM_VAR !== \'custom_value\' || ' +
        '!process.env.EXPANDED_PATH.includes(\'test-dir\')) ' +
        'process.exit(1);"',
        true,
    );
    exitCode.should.equal(0);
  });

  it('supports task with local path and null git', async () => {
    const task = new Task({
      name: 'local1',
      path: repo1Path,
      command: 'npm start',
    }, null, 1000);
    const json = await task.toJson();
    json.name.should.equal('local1');
    json.path.should.equal(repo1Path);
    (json.git === null).should.be.true;

    await task.start();
    try {
      const runningJson = await task.toJson();
      runningJson.status.should.equal('RUNNING');
      runningJson.pid.should.not.equal(-1);
      await task.pollUpdates();
    } finally {
      await task.stop();
    }
  });
});
