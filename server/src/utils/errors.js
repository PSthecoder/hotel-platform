class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = {
  AppError,
  asyncHandler,
  badRequest: (m, d) => new AppError(400, 'VALIDATION_ERROR', m, d),
  unauthenticated: (m = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', m),
  forbidden: (m = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', m),
  notFound: (m = 'Resource not found') => new AppError(404, 'NOT_FOUND', m),
  conflict: (code, m) => new AppError(409, code, m),
};
