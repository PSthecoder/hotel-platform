const { ZodError } = require('zod');
const { badRequest } = require('../utils/errors');
/** validate({ body, query, params }) – replaces each with the parsed (typed, defaulted) value. */
module.exports = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key] ?? {});
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ field: i.path.join('.') || '(root)', issue: i.message }));
      return next(badRequest(details[0] ? `${details[0].field}: ${details[0].issue}` : 'Invalid input', details));
    }
    next(err);
  }
};
