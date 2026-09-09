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
});
