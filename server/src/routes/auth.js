const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const cfg = require('../config');
const db = require('../db');
const logger = require('../logger');
const S = require('../schemas');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, unauthenticated, AppError } = require('../utils/errors');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: cfg.isTest ? 10000 : 30, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later', requestId: req.id } }) });

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email, role: u.role });
const signAccess = (u) => jwt.sign({ sub: u.id, role: u.role }, cfg.jwtAccessSecret, { expiresIn: cfg.accessTtl });
const cookieOpts = { httpOnly: true, secure: cfg.isProd, sameSite: cfg.isProd ? 'none' : 'lax', path: '/api/auth', maxAge: cfg.refreshDays * 864e5 };

async function issueRefresh(userId, res) {
  const raw = crypto.randomBytes(32).toString('hex');
  await db.query('INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [userId, sha(raw), new Date(Date.now() + cfg.refreshDays * 864e5)]);
  res.cookie('rt', raw, cookieOpts);
  return raw;
}

router.post('/register', limiter, validate({ body: S.register }), asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;
  const hash = await bcrypt.hash(password, cfg.bcryptCost);
  let user;
  try {
    ({ rows: [user] } = await db.query('INSERT INTO users(full_name,email,password_hash) VALUES ($1,$2,$3) RETURNING *', [fullName, email, hash]));
  } catch (e) {
    if (e.code === '23505') throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw e;
  }
  await issueRefresh(user.id, res);
  logger.info('User registered', { userId: user.id });
  res.status(201).json({ success: true, data: { accessToken: signAccess(user), user: publicUser(user) } });
}));

router.post('/login', limiter, validate({ body: S.login }), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { rows: [user] } = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    logger.warn('Login failed', { email });
    throw unauthenticated('Invalid email or password');
  }
  await issueRefresh(user.id, res);
  logger.info('Login success', { userId: user.id, role: user.role });
  res.json({ success: true, data: { accessToken: signAccess(user), user: publicUser(user) } });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const raw = req.cookies?.rt;
  if (!raw) throw unauthenticated('No refresh token');
  const { rows: [t] } = await db.query('SELECT * FROM refresh_tokens WHERE token_hash=$1', [sha(raw)]);
  if (!t) throw unauthenticated('Invalid refresh token');
  if (t.revoked) {
    // A rotated-out token was presented again: assume theft and kill every session of that user.
    await db.query('UPDATE refresh_tokens SET revoked=true WHERE user_id=$1', [t.user_id]);
    logger.warn('Refresh token reuse detected; all sessions revoked', { userId: t.user_id });
    throw unauthenticated('Session revoked, please log in again');
  }
  if (new Date(t.expires_at) < new Date()) throw unauthenticated('Refresh token expired');
  await db.query('UPDATE refresh_tokens SET revoked=true WHERE id=$1', [t.id]);
  const { rows: [user] } = await db.query('SELECT * FROM users WHERE id=$1', [t.user_id]);
  await issueRefresh(user.id, res);
  logger.info('Token refreshed', { userId: user.id });
  res.json({ success: true, data: { accessToken: signAccess(user), user: publicUser(user) } });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const raw = req.cookies?.rt;
  if (raw) await db.query('UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1', [sha(raw)]);
  res.clearCookie('rt', { ...cookieOpts, maxAge: undefined });
  res.json({ success: true, data: { loggedOut: true } });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const { rows: [user] } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!user) throw unauthenticated();
  res.json({ success: true, data: { user: publicUser(user) } });
}));
module.exports = router;
