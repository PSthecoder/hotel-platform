const winston = require('winston');
const cfg = require('./config');
const logger = winston.createLogger({
  level: cfg.isTest ? 'error' : process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
  transports: [new winston.transports.Console()],
});
module.exports = logger;
