// Enquiries, reviews and uploads
const router = require('express').Router();
const db = require('../db');
const S = require('../schemas');
const cfg = require('../config');
const logger = require('../logger');
const validate = require('../middleware/validate');
const { authenticate, optionalAuth, adminOnly } = require('../middleware/auth');
const { upload, saveUpload } = require('../middleware/upload');
const { asyncHandler, notFound, forbidden, conflict, badRequest } = require('../utils/errors');
const { enqueue } = require('../jobs/queue');

/* ---- Enquiries ---- */
router.post('/enquiries', optionalAuth, validate({ body: S.createEnquiry }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [p] } = await db.query('SELECT name FROM properties WHERE id=$1', [b.propertyId]);
  if (!p) throw notFound('Property not found');
  const { rows: [e] } = await db.query('INSERT INTO enquiries(user_id,property_id,name,email,message) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.user?.id || null, b.propertyId, b.name, b.email, b.message]);
  logger.info('Enquiry received', { id: e.id, propertyId: b.propertyId });
  await enqueue('enquiry-received', { propertyName: p.name, name: b.name, email: b.email, message: b.message });
  res.status(201).json({ success: true, data: { id: e.id } });
}));
router.get('/enquiries', adminOnly, asyncHandler(async (_req, res) => {
  const { rows } = await db.query(`SELECT e.id, e.name, e.email, e.message, e.status, e.created_at AS "createdAt", p.name AS "propertyName" FROM enquiries e JOIN properties p ON p.id=e.property_id ORDER BY e.created_at DESC LIMIT 200`);
  res.json({ success: true, data: rows });
}));
router.patch('/enquiries/:id', adminOnly, validate({ params: S.idParam, body: S.patchEnquiry }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('UPDATE enquiries SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
  if (!rowCount) throw notFound('Enquiry not found');
  res.json({ success: true, data: { id: req.params.id, status: req.body.status } });
}));
router.delete('/enquiries/:id', adminOnly, validate({ params: S.idParam }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM enquiries WHERE id=$1', [req.params.id]);
  if (!rowCount) throw notFound('Enquiry not found');
  res.json({ success: true, data: { deleted: true } });
}));

/* ---- Reviews ---- */
router.get('/reviews', validate({ query: S.reviewQuery }), asyncHandler(async (req, res) => {
  const { rows } = await db.query(`SELECT r.id, r.rating, r.comment, r.image_url AS "imageUrl", r.created_at AS "createdAt", u.full_name AS guest FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.property_id=$1 ORDER BY r.created_at DESC LIMIT 50`, [req.query.propertyId]);
  res.json({ success: true, data: rows });
}));
router.post('/reviews', authenticate, validate({ body: S.createReview }), asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows: [bk] } = await db.query(`SELECT b.guest_id, b.status, rt.property_id FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id WHERE b.id=$1`, [b.bookingId]);
  if (!bk) throw notFound('Booking not found');
  if (bk.guest_id !== req.user.id) throw forbidden();
  if (bk.status !== 'completed') throw conflict('NOT_COMPLETED', 'You can review a stay only after it is completed');
  try {
    const { rows: [r] } = await db.query('INSERT INTO reviews(booking_id,property_id,user_id,rating,comment,image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [b.bookingId, bk.property_id, req.user.id, b.rating, b.comment, b.imageUrl || null]);
    logger.info('Review created', { id: r.id, userId: req.user.id });
    res.status(201).json({ success: true, data: { id: r.id } });
  } catch (e) {
    if (e.code === '23505') throw conflict('ALREADY_REVIEWED', 'This stay has already been reviewed');
    throw e;
  }
}));
router.delete('/reviews/:id', adminOnly, validate({ params: S.idParam }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM reviews WHERE id=$1', [req.params.id]);
  if (!rowCount) throw notFound('Review not found');
  res.json({ success: true, data: { deleted: true } });
}));

/* ---- Image upload ---- */
router.post('/uploads', authenticate, (req, res, next) => upload(req, res, (err) => (err ? next(err) : next())), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('Attach an image in the "image" field');
  const name = saveUpload(req.file.buffer);
  logger.info('Image uploaded', { userId: req.user.id, name, bytes: req.file.size });
  res.status(201).json({ success: true, data: { url: `${cfg.publicBaseUrl}/uploads/${name}` } });
}));
module.exports = router;
