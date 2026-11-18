const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const logger = require('./logger');
const db = require('./db');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const app = express();
app.set('trust proxy', 1); // behind Render's proxy
// Strict CSP for the JSON API; Swagger UI (/api/docs) needs inline scripts so it gets helmet without CSP.
const helmetApi = helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }); // cross-origin so the Vercel front end can show /uploads images
const helmetDocs = helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
app.use((req, res, next) => (req.path.startsWith('/api/docs') ? helmetDocs(req, res, next) : helmetApi(req, res, next)));
app.use(cors({ origin: (origin, cb) => (!origin || cfg.corsOrigins.includes(origin) ? cb(null, true) : cb(null, false)), credentials: true }));
app.use((req, res, next) => { req.id = crypto.randomBytes(4).toString('hex'); res.setHeader('X-Request-Id', req.id); next(); });
if (!cfg.isTest) app.use(morgan(':method :url :status :response-time ms', { stream: { write: (m) => logger.info(m.trim()) } }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.resolve(cfg.uploadDir), { maxAge: '7d' }));

const api = express.Router();
api.get('/health', async (_req, res) => {
  try { await db.query('SELECT 1'); res.json({ success: true, data: { status: 'ok' } }); }
  catch { res.status(503).json({ success: false, error: { code: 'DB_DOWN', message: 'Database unavailable' } }); }
});
api.use('/auth', require('./routes/auth'));
api.use('/properties', require('./routes/properties'));
api.use('/bookings', require('./routes/bookings'));
api.use('/admin', require('./routes/admin'));
api.use('/', require('./routes/catalog'));
api.use('/', require('./routes/engagement'));
const { spec } = require('./openapi');
api.get('/docs.json', (_req, res) => res.json(spec));
api.use('/docs', require('swagger-ui-express').serve, require('swagger-ui-express').setup(spec));
app.use('/api', api);

app.use(notFoundHandler);
app.use(errorHandler);
module.exports = app;
