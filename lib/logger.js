const {createLogger, format, transports} = require('winston');
require('winston-daily-rotate-file');

const logger = createLogger({
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
    new transports.DailyRotateFile({
      filename: 'proceger-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxFiles: '7d',
    }),
  ],
});

module.exports = logger;
