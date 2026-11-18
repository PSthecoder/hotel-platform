const router = require('express').Router();
const db = require('../db');
const S = require('../schemas');
const logger = require('../logger');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, notFound, forbidden, conflict, badRequest } = require('../utils/errors');
const { nightsBetween, todayISO } = require('../utils/dates');
const { enqueue } = require('../jobs/queue');

const DETAIL = `SELECT b.id, b.check_in AS "checkIn", b.check_out AS "checkOut", b.nights, b.guests, b.total_inr AS "totalInr", b.status, b.created_at AS "createdAt",
  b.guest_id AS "guestId", u.full_name AS "guestName", u.email AS "guestEmail",
  r.room_no AS "roomNo", rt.canonical_name AS "roomType", p.id AS "propertyId", p.name AS "propertyName",
  EXISTS (SELECT 1 FROM reviews rv WHERE rv.booking_id = b.id) AS reviewed
  FROM bookings b JOIN users u ON u.id=b.guest_id JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id JOIN properties p ON p.id=rt.property_id`;

router.post('/', authenticate, validate({ body: S.createBooking }), asyncHandler(async (req, res) => {
  const { roomTypeId, checkIn, checkOut, guests, notes } = req.body;
  if (checkIn < todayISO()) throw badRequest('checkIn cannot be in the past', [{ field: 'checkIn', issue: 'cannot be in the past' }]);
  const nights = nightsBetween(checkIn, checkOut);
  if (nights > 30) throw badRequest('Maximum stay is 30 nights', [{ field: 'checkOut', issue: 'stay longer than 30 nights' }]);

  const { rows: [rt] } = await db.query('SELECT rt.*, p.name AS property_name FROM room_types rt JOIN properties p ON p.id=rt.property_id WHERE rt.id=$1', [roomTypeId]);
  if (!rt) throw notFound('Room type not found');
  if (guests > rt.capacity) throw badRequest(`This room sleeps at most ${rt.capacity} guests`, [{ field: 'guests', issue: `max ${rt.capacity}` }]);

  const { rows: free } = await db.query(
    `SELECT r.id FROM rooms r WHERE r.room_type_id=$1 AND r.status='active'
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.status IN ('confirmed','checked_in') AND b.check_in < $3::date AND b.check_out > $2::date)
     ORDER BY r.room_no LIMIT 5`, [roomTypeId, checkIn, checkOut]);

  const total = Math.round(nights * rt.base_rate_inr * 100) / 100;
  // The exclusion constraint is the real guard: if another request wins the race for a room, try the next one.
  for (const { id: roomId } of free) {
    try {
      const { rows: [b] } = await db.query(
        `INSERT INTO bookings(guest_id, room_id, check_in, check_out, nights, guests, total_inr, original_amount, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING id`, [req.user.id, roomId, checkIn, checkOut, nights, guests, total, notes || null]);
      const { rows: [u] } = await db.query('SELECT full_name, email FROM users WHERE id=$1', [req.user.id]);
      logger.info('Booking created', { bookingId: b.id, userId: req.user.id, roomId, nights, total });
      await enqueue('booking-confirmation', { id: b.id, name: u.full_name, email: u.email, propertyName: rt.property_name, roomType: rt.canonical_name, checkIn, checkOut, totalInr: total });
      return res.status(201).json({ success: true, data: { id: b.id, nights, totalInr: total, status: 'confirmed' } });
    } catch (e) {
      if (e.code !== '23P01') throw e;
    }
  }
  throw conflict('ROOM_UNAVAILABLE', 'No rooms of this type are available for those dates');
}));

router.get('/', authenticate, validate({ query: S.listBookings }), asyncHandler(async (req, res) => {
  const { propertyId, status, page, limit } = req.query;
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const where = [];
  if (req.user.role !== 'admin') where.push(`b.guest_id = ${add(req.user.id)}`);
  if (propertyId) where.push(`p.id = ${add(propertyId)}`);
  if (status) where.push(`b.status = ${add(status)}`);
  const sql = `${DETAIL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.created_at DESC, b.id DESC LIMIT ${add(limit)} OFFSET ${add((page - 1) * limit)}`;
  const { rows } = await db.query(sql, params);
  res.json({ success: true, data: rows, meta: { page, limit } });
}));

router.patch('/:id', authenticate, validate({ params: S.idParam, body: S.patchBooking }), asyncHandler(async (req, res) => {
  const { rows: [b] } = await db.query(`${DETAIL} WHERE b.id=$1`, [req.params.id]);
  if (!b) throw notFound('Booking not found');
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin) {
    if (b.guestId !== req.user.id) throw forbidden();
    if (req.body.status !== 'cancelled') throw forbidden('Guests can only cancel bookings');
    if (b.status !== 'confirmed' || b.checkIn <= todayISO()) throw conflict('NOT_CANCELLABLE', 'Only upcoming confirmed bookings can be cancelled');
  }
  try {
    await db.query('UPDATE bookings SET status=$1 WHERE id=$2', [req.body.status, b.id]);
  } catch (e) {
    if (e.code === '23P01') throw conflict('ROOM_UNAVAILABLE', 'Cannot reactivate: room has been rebooked for those dates');
    throw e;
  }
  logger.info('Booking status changed', { bookingId: b.id, from: b.status, to: req.body.status, by: req.user.id });
  if (req.body.status === 'cancelled') await enqueue('booking-cancelled', { id: b.id, name: b.guestName, email: b.guestEmail, propertyName: b.propertyName, checkIn: b.checkIn, checkOut: b.checkOut });
  res.json({ success: true, data: { id: b.id, status: req.body.status } });
}));

router.delete('/:id', authenticate, authorize('admin'), validate({ params: S.idParam }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM bookings WHERE id=$1', [req.params.id]);
  if (!rowCount) throw notFound('Booking not found');
  logger.info('Booking deleted', { bookingId: req.params.id, by: req.user.id });
  res.json({ success: true, data: { deleted: true } });
}));
module.exports = router;
