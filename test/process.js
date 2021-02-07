const Process = require('../lib/process');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Testing Process class', () => {
  it('echo hello', () => {
    const process = new Process({
      command: 'echo',
      args: ['hello'],
    });
    return expect(process.start()).to.eventually.equals(0);
  });

  it('large output', () => {
    const process = new Process({
      command: 'head',
      args: ['-c', '2048000', '/dev/zero'],
    });

    return expect(process.start().then(() => {
      return process.getStdout().length;
    })).to.eventually.equals(1024 * 1024);
  });
});

