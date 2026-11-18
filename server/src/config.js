require('dotenv').config();
const e = process.env;
const required = (name) => {
  if (!e[name]) throw new Error(`Missing required environment variable: ${name}`);
  return e[name];
};
const env = e.NODE_ENV || 'development';
const cfg = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(e.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: e.DATABASE_SSL === 'true',
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  accessTtl: e.ACCESS_TTL || '15m',
  refreshDays: Number(e.REFRESH_DAYS) || 7,
  bcryptCost: Number(e.BCRYPT_COST) || 12,
  corsOrigins: (e.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  usdInr: Number(e.USD_INR_RATE) || 83,
  uploadDir: e.UPLOAD_DIR || './uploads',
  publicBaseUrl: e.PUBLIC_BASE_URL || `http://localhost:${Number(e.PORT) || 4000}`,
  redisUrl: e.REDIS_URL || '',
  smtp: { host: e.SMTP_HOST || '', port: Number(e.SMTP_PORT) || 587, user: e.SMTP_USER || '', pass: e.SMTP_PASS || '' },
  mailFrom: e.MAIL_FROM || 'Hotel Platform <no-reply@example.com>',
  adminEmail: e.ADMIN_EMAIL || '',
  adminPassword: e.ADMIN_PASSWORD || '',
};
if (cfg.jwtAccessSecret.length < 16) throw new Error('JWT_ACCESS_SECRET must be at least 16 characters');
module.exports = cfg;
