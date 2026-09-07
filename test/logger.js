const chai = require('chai');
const path = require('path');
const fs = require('fs');
chai.should();

const logger = require('../lib/logger');

describe('Logger', function() {
  function cleanupTransport(transport, dir) {
    return new Promise((resolve) => {
      if (transport && transport.logStream) {
        transport.logStream.end(() => {
          fs.rmSync(dir, {recursive: true, force: true});
          resolve();
        });
      } else {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, {recursive: true, force: true});
        }
        resolve();
      }
    });
  }

  it('exports a default logger instance', () => {
    logger.should.be.an('object');
    logger.info.should.be.a('function');
    logger.debug.should.be.a('function');
    logger.error.should.be.a('function');
  });

  it('uses custom logDir when provided in config', async () => {
    const testDir = path.join('/tmp', 'test-proceger-logdir-' + Date.now());
    const customLogger = logger.createLogger({logDir: testDir});
    const rotateTransport = customLogger.transports.find(
        (t) => t.constructor.name === 'DailyRotateFile',
    );
    rotateTransport.should.be.an('object');
    rotateTransport.dirname.should.equal(testDir);
    await cleanupTransport(rotateTransport, testDir);
  });

  it('uses custom log_dir snake_case when provided in config', async () => {
    const testDir = path.join('/tmp', 'test-proceger-log_dir-' + Date.now());
    const customLogger = logger.createLogger({log_dir: testDir});
    const rotateTransport = customLogger.transports.find(
        (t) => t.constructor.name === 'DailyRotateFile',
    );
    rotateTransport.should.be.an('object');
    rotateTransport.dirname.should.equal(testDir);
    await cleanupTransport(rotateTransport, testDir);
  });
});
