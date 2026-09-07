const {createLogger, format, transports} = require('winston');
require('winston-daily-rotate-file');
const rc = require('rc');

/**
 * Creates a Winston logger instance configured with console
 * and daily rotate file transports.
 * @param {Object} [cfg] Optional configuration object.
 * @return {Object} Winston logger instance.
 */
function createLoggerInstance(cfg = rc('proceger')) {
  const dailyRotateOptions = {
    filename: 'proceger-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxFiles: '7d',
  };

  const logDir = cfg.logDir || cfg.log_dir;
  if (logDir) {
    dailyRotateOptions.dirname = logDir;
  }

  return createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        format.errors({stack: true}),
        format.json(),
        format.splat(),
    ),
    transports: [
      new transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple(),
        ),
      }),
      new transports.DailyRotateFile(dailyRotateOptions),
    ],
  });
}

const logger = createLoggerInstance();
logger.createLogger = createLoggerInstance;

module.exports = logger;

