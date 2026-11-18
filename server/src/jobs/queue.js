const cfg = require('../config');
const logger = require('../logger');
const { handle } = require('./email');

let queue = null;
if (cfg.redisUrl && !cfg.isTest) {
  const { Queue } = require('bullmq');
  const IORedis = require('ioredis');
  const connection = new IORedis(cfg.redisUrl, { maxRetriesPerRequest: null });
  queue = new Queue('notifications', { connection });
  logger.info('Job queue enabled (BullMQ + Redis)');
}

/** Enqueue a notification. Never throws: a failed email must not fail the booking request. */
async function enqueue(name, data) {
  try {
    if (queue) {
      await queue.add(name, data, { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 });
    } else if (!cfg.isTest) {
      // No Redis configured: run in-process, off the request path.
      setImmediate(() => handle(name, data).catch((e) => logger.error('Inline job failed', { name, err: String(e) })));
    }
  } catch (err) {
    logger.error('Failed to enqueue job', { name, err: String(err) });
  }
}
module.exports = { enqueue };
