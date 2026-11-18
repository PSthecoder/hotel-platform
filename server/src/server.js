const app = require('./app');
const cfg = require('./config');
const logger = require('./logger');
const db = require('./db');
const server = app.listen(cfg.port, () => logger.info(`API listening on :${cfg.port} (${cfg.env})`));
const shutdown = (sig) => { logger.info(`${sig} received, shutting down`); server.close(() => db.pool.end().then(() => process.exit(0))); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => logger.error('unhandledRejection', { err: String(e) }));
