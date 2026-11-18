const cfg = require('../config');
const logger = require('../logger');
const { handle } = require('./email');
if (!cfg.redisUrl) { console.error('REDIS_URL is required to run the worker'); process.exit(1); }
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const connection = new IORedis(cfg.redisUrl, { maxRetriesPerRequest: null });
const worker = new Worker('notifications', (job) => handle(job.name, job.data), { connection, concurrency: 5 });
worker.on('completed', (job) => logger.info('Job completed', { id: job.id, name: job.name }));
worker.on('failed', (job, err) => logger.error('Job failed', { id: job?.id, name: job?.name, attempts: job?.attemptsMade, err: String(err) }));
logger.info('Worker started');
