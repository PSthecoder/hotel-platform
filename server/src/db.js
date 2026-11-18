const { Pool, types } = require('pg');
const cfg = require('./config');
types.setTypeParser(1082, (v) => v);            // DATE -> 'YYYY-MM-DD' string (no timezone shifts)
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC -> number
types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT/COUNT -> number

const pool = new Pool({
  connectionString: cfg.databaseUrl,
  ssl: cfg.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});
module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  async tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
