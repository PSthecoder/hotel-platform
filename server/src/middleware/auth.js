const jwt = require('jsonwebtoken');
const cfg = require('../config');
const { unauthenticated, forbidden } = require('../utils/errors');

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
function verify(token) {
  const p = jwt.verify(token, cfg.jwtAccessSecret);
  return { id: Number(p.sub), role: p.role };
}
const authenticate = (req, _res, next) => {
  const t = readToken(req);
  if (!t) return next(unauthenticated());
  try { req.user = verify(t); next(); } catch { next(unauthenticated('Invalid or expired access token')); }
};
const optionalAuth = (req, _res, next) => {
  const t = readToken(req);
  if (t) { try { req.user = verify(t); } catch { /* treated as anonymous */ } }
  next();
};
const authorize = (...roles) => (req, _res, next) => (roles.includes(req.user?.role) ? next() : next(forbidden()));
module.exports = { authenticate, optionalAuth, authorize, adminOnly: [authenticate, authorize('admin')] };
