const router = require('express').Router();
const db = require('../db');
const S = require('../schemas');
const logger = require('../logger');
const validate = require('../middleware/validate');
const { adminOnly } = require('../middleware/auth');
const { asyncHandler, notFound } = require('../utils/errors');

/* ---------- Search with filters ---------- */
router.get('/rooms/search', validate({ query: S.search }), asyncHandler(async (req, res) => {
  const q = req.query;
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const where = [];
  if (q.city) where.push(`p.city ILIKE ${add(`%${q.city}%`)}`);
  if (q.propertyId) where.push(`p.id = ${add(q.propertyId)}`);
  if (q.guests) where.push(`rt.capacity >= ${add(q.guests)}`);
  if (q.minPrice !== undefined) where.push(`rt.base_rate_inr >= ${add(q.minPrice)}`);
  if (q.maxPrice !== undefined) where.push(`rt.base_rate_inr <= ${add(q.maxPrice)}`);
  if (q.roomType) where.push(`rt.canonical_name ILIKE ${add(`%${q.roomType}%`)}`);

  let availExpr = `(SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active')`;
  if (q.checkIn && q.checkOut) {
    const ci = add(q.checkIn), co = add(q.checkOut);
    availExpr = `(SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.status IN ('confirmed','checked_in')
        AND b.check_in < ${co}::date AND b.check_out > ${ci}::date))`;
  }
  const outer = ['t.available > 0'];
  if (q.minRating !== undefined) outer.push(`t.rating >= ${add(q.minRating)}`);
  const order = { price_asc: 't."rateInr" ASC', price_desc: 't."rateInr" DESC', rating: 't.rating DESC, t."rateInr" ASC' }[q.sort];
  const limit = add(q.limit), offset = add((q.page - 1) * q.limit);

  const sql = `SELECT t.*, COUNT(*) OVER() AS total FROM (
      SELECT rt.id, rt.canonical_name AS "roomType", rt.capacity, rt.base_rate_inr AS "rateInr", rt.amenities, rt.image_url AS "imageUrl",
             p.id AS "propertyId", p.name AS "propertyName", p.city,
             COALESCE((SELECT ROUND(AVG(rating),1) FROM reviews WHERE property_id = p.id), 0) AS rating,
             ${availExpr} AS available
      FROM room_types rt JOIN properties p ON p.id = rt.property_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ) t WHERE ${outer.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`;
  const { rows } = await db.query(sql, params);
  const total = rows[0]?.total ?? 0;
  res.json({ success: true, data: rows.map(({ total: _t, ...r }) => r), meta: { page: q.page, limit: q.limit, total } });
}));

/* ---------- Room types (public read, admin write) ---------- */
router.get('/room-types', asyncHandler(async (req, res) => {
  const pid = Number(req.query.propertyId) || null;
  const { rows } = await db.query(`SELECT id, property_id AS "propertyId", canonical_name AS "canonicalName", capacity, base_rate_inr AS "baseRateInr", amenities, image_url AS "imageUrl" FROM room_types WHERE ($1::int IS NULL OR property_id=$1) ORDER BY property_id, base_rate_inr`, [pid]);
  res.json({ success: true, data: rows });
}));
router.post('/room-types', adminOnly, validate({ body: S.roomType }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [r] } = await db.query('INSERT INTO room_types(property_id,canonical_name,capacity,base_rate_inr,amenities,image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [b.propertyId, b.canonicalName, b.capacity, b.baseRateInr, b.amenities, b.imageUrl || null]);
  logger.info('Room type created', { id: r.id, by: req.user.id });
  res.status(201).json({ success: true, data: { id: r.id } });
}));
router.put('/room-types/:id', adminOnly, validate({ params: S.idParam, body: S.roomType }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rowCount } = await db.query('UPDATE room_types SET property_id=$1, canonical_name=$2, capacity=$3, base_rate_inr=$4, amenities=$5, image_url=$6 WHERE id=$7', [b.propertyId, b.canonicalName, b.capacity, b.baseRateInr, b.amenities, b.imageUrl || null, req.params.id]);
  if (!rowCount) throw notFound('Room type not found');
  res.json({ success: true, data: { id: req.params.id } });
}));
router.delete('/room-types/:id', adminOnly, validate({ params: S.idParam }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM room_types WHERE id=$1', [req.params.id]);
  if (!rowCount) throw notFound('Room type not found');
  logger.info('Room type deleted', { id: req.params.id, by: req.user.id });
  res.json({ success: true, data: { deleted: true } });
}));

/* ---------- Rooms (admin) ---------- */
router.get('/rooms', adminOnly, asyncHandler(async (req, res) => {
  const rt = Number(req.query.roomTypeId) || null;
  const { rows } = await db.query(`SELECT id, room_type_id AS "roomTypeId", room_no AS "roomNo", status FROM rooms WHERE ($1::int IS NULL OR room_type_id=$1) ORDER BY room_no`, [rt]);
  res.json({ success: true, data: rows });
}));
router.post('/rooms', adminOnly, validate({ body: S.room }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [r] } = await db.query('INSERT INTO rooms(room_type_id,room_no,status) VALUES ($1,$2,$3) RETURNING id', [b.roomTypeId, b.roomNo, b.status]);
  res.status(201).json({ success: true, data: { id: r.id } });
}));
router.put('/rooms/:id', adminOnly, validate({ params: S.idParam, body: S.room }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rowCount } = await db.query('UPDATE rooms SET room_type_id=$1, room_no=$2, status=$3 WHERE id=$4', [b.roomTypeId, b.roomNo, b.status, req.params.id]);
  if (!rowCount) throw notFound('Room not found');
  res.json({ success: true, data: { id: req.params.id } });
}));
router.delete('/rooms/:id', adminOnly, validate({ params: S.idParam }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM rooms WHERE id=$1', [req.params.id]);
  if (!rowCount) throw notFound('Room not found');
  res.json({ success: true, data: { deleted: true } });
}));
module.exports = router;
