const router = require('express').Router();
const db = require('../db');
const S = require('../schemas');
const logger = require('../logger');
const validate = require('../middleware/validate');
const { adminOnly } = require('../middleware/auth');
const { asyncHandler, notFound } = require('../utils/errors');

const SELECT = `SELECT p.id, p.name, p.city, p.address, p.image_url AS "imageUrl",
  (SELECT MIN(base_rate_inr) FROM room_types WHERE property_id=p.id) AS "fromRateInr",
  (SELECT ROUND(AVG(rating),1) FROM reviews WHERE property_id=p.id) AS rating,
  (SELECT COUNT(*) FROM reviews WHERE property_id=p.id) AS "reviewCount" FROM properties p`;

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await db.query(`${SELECT} ORDER BY p.name`);
  res.json({ success: true, data: rows });
}));

router.get('/:id', validate({ params: S.idParam }), asyncHandler(async (req, res) => {
  const { rows: [p] } = await db.query(`${SELECT} WHERE p.id=$1`, [req.params.id]);
  if (!p) throw notFound('Property not found');
  const { rows: roomTypes } = await db.query(`SELECT id, canonical_name AS "name", capacity, base_rate_inr AS "rateInr", amenities, image_url AS "imageUrl" FROM room_types WHERE property_id=$1 ORDER BY base_rate_inr`, [p.id]);
  const { rows: reviews } = await db.query(`SELECT r.id, r.rating, r.comment, r.image_url AS "imageUrl", r.created_at AS "createdAt", u.full_name AS "guest" FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.property_id=$1 ORDER BY r.created_at DESC LIMIT 20`, [p.id]);
  res.json({ success: true, data: { ...p, roomTypes, reviews } });
}));

router.post('/', adminOnly, validate({ body: S.property }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [row] } = await db.query('INSERT INTO properties(name,city,address,image_url) VALUES ($1,$2,$3,$4) RETURNING id', [b.name, b.city, b.address, b.imageUrl || null]);
  logger.info('Property created', { id: row.id, by: req.user.id });
  res.status(201).json({ success: true, data: { id: row.id } });
}));

router.put('/:id', adminOnly, validate({ params: S.idParam, body: S.property }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rowCount } = await db.query('UPDATE properties SET name=$1, city=$2, address=$3, image_url=$4 WHERE id=$5', [b.name, b.city, b.address, b.imageUrl || null, req.params.id]);
  if (!rowCount) throw notFound('Property not found');
  logger.info('Property updated', { id: req.params.id, by: req.user.id });
  res.json({ success: true, data: { id: req.params.id } });
}));

router.delete('/:id', adminOnly, validate({ params: S.idParam }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM properties WHERE id=$1', [req.params.id]);
  if (!rowCount) throw notFound('Property not found');
  logger.info('Property deleted', { id: req.params.id, by: req.user.id });
  res.json({ success: true, data: { deleted: true } });
}));
module.exports = router;
