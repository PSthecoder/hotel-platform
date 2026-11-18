const router = require('express').Router();
const db = require('../db');
const S = require('../schemas');
const validate = require('../middleware/validate');
const { adminOnly } = require('../middleware/auth');
const { asyncHandler } = require('../utils/errors');
const { computeKpis, sumRows } = require('../services/metrics');

const COUNTED = `('confirmed','checked_in','completed')`;

/**
 * Occupancy, ADR and RevPAR for an inclusive period [from, to], per property and in total.
 * Stays that cross the period boundary are pro-rated by the nights inside the range.
 * Available nights = active rooms x days in period. Group totals are re-computed from summed
 * numerators/denominators (never an average of per-property percentages).
 */
router.get('/metrics', adminOnly, validate({ query: S.metrics }), asyncHandler(async (req, res) => {
  const { from, to, propertyId } = req.query;
  const pid = propertyId ?? null;
  const { rows } = await db.query(
    `WITH p AS (SELECT $1::date AS f, ($2::date + 1) AS t),
     sold AS (
       SELECT rt.property_id,
         SUM(GREATEST(0, LEAST(b.check_out, p.t) - GREATEST(b.check_in, p.f)))::int AS nights,
         SUM(GREATEST(0, LEAST(b.check_out, p.t) - GREATEST(b.check_in, p.f)) * (b.total_inr / b.nights))::float AS revenue
       FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id CROSS JOIN p
       WHERE b.status IN ${COUNTED} AND b.check_in < p.t AND b.check_out > p.f
       GROUP BY rt.property_id),
     active AS (SELECT rt.property_id, COUNT(*)::int AS n FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.status='active' GROUP BY rt.property_id)
     SELECT pr.id, pr.name, COALESCE(s.nights,0) AS "soldNights", COALESCE(s.revenue,0) AS revenue,
            COALESCE(a.n,0) AS "activeRooms", COALESCE(a.n,0) * (SELECT t - f FROM p) AS "availableNights"
     FROM properties pr LEFT JOIN sold s ON s.property_id=pr.id LEFT JOIN active a ON a.property_id=pr.id
     WHERE ($3::int IS NULL OR pr.id=$3) ORDER BY pr.name`, [from, to, pid]);

  const byProperty = rows.map((r) => ({ propertyId: r.id, name: r.name, activeRooms: r.activeRooms, soldNights: r.soldNights, availableNights: r.availableNights, revenue: Math.round(r.revenue), ...computeKpis(r) }));
  const totals = sumRows(rows);
  const activeRooms = rows.reduce((a, r) => a + r.activeRooms, 0);

  const { rows: trend } = await db.query(
    `SELECT to_char(d::date,'YYYY-MM-DD') AS day, COUNT(b.id)::int AS "soldNights", COALESCE(SUM(b.total_inr / b.nights),0)::float AS revenue
     FROM generate_series($1::date, $2::date, interval '1 day') d
     LEFT JOIN bookings b ON b.status IN ${COUNTED} AND b.check_in <= d::date AND b.check_out > d::date
       AND ($3::int IS NULL OR b.room_id IN (SELECT r.id FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE rt.property_id=$3))
     GROUP BY d ORDER BY d`, [from, to, pid]);

  res.json({ success: true, data: { period: { from, to }, propertyId: pid, activeRooms,
    totals: { ...totals, revenue: Math.round(totals.revenue), ...computeKpis(totals) }, byProperty,
    trend: trend.map((t) => ({ ...t, revenue: Math.round(t.revenue), occupancyPct: activeRooms ? Math.round((t.soldNights / activeRooms) * 1000) / 10 : 0 })) } });
}));
module.exports = router;
