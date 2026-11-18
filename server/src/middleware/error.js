const logger = require('../logger');
const { AppError } = require('../utils/errors');
const cfg = require('../config');

const notFoundHandler = (req, res) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found`, requestId: req.id } });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let status = 500, code = 'INTERNAL_ERROR', message = 'Something went wrong', details;
  if (err instanceof AppError) ({ status, code, message, details } = err);
  else if (err.code === '23505') { status = 409; code = 'DUPLICATE'; message = 'A record with these details already exists'; }
  else if (err.code === '23503') { status = 409; code = 'IN_USE'; message = 'Record is referenced by other data or points to a missing record'; }
  else if (err.code === '23P01') { status = 409; code = 'ROOM_UNAVAILABLE'; message = 'Room is not available for those dates'; }
  else if (err.type === 'entity.parse.failed') { status = 400; code = 'VALIDATION_ERROR'; message = 'Malformed JSON body'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 400; code = 'VALIDATION_ERROR'; message = 'File too large (max 2 MB)'; }

  if (status >= 500) logger.error('Unhandled error', { requestId: req.id, path: req.path, err: err.stack || String(err) });
  else logger.warn('Request failed', { requestId: req.id, path: req.path, status, code });
  res.status(status).json({ success: false, error: { code, message: status >= 500 && cfg.isProd ? 'Something went wrong' : message, ...(details && { details }), requestId: req.id } });
};
module.exports = { notFoundHandler, errorHandler };
