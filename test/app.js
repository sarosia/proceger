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
    const app = createApp(taskManager);
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
});
