/** Pure KPI maths, shared by the API and unit tests. */
const round = (n, dp = 2) => Math.round((n + Number.EPSILON) * 10 ** dp) / 10 ** dp;

/** Occupancy %, ADR and RevPAR. Zero denominators return 0 (never NaN/Infinity). */
function computeKpis({ soldNights, revenue, availableNights }) {
  const occupancyPct = availableNights > 0 ? (soldNights / availableNights) * 100 : 0;
  const adr = soldNights > 0 ? revenue / soldNights : 0;
  const revpar = availableNights > 0 ? revenue / availableNights : 0;
  return { occupancyPct: round(occupancyPct, 1), adr: round(adr), revpar: round(revpar) };
}

const DAY = 864e5;
const toMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/**
 * Nights of a stay [checkIn, checkOut) that fall inside the inclusive period [from, to].
 * Mirrors the SQL used in the metrics endpoint (stays crossing the boundary are pro-rated).
 */
function overlapNights(checkIn, checkOut, from, to) {
  const start = Math.max(toMs(checkIn), toMs(from));
  const end = Math.min(toMs(checkOut), toMs(to) + DAY);
  return Math.max(0, Math.round((end - start) / DAY));
}

function sumRows(rows) {
  return rows.reduce(
    (a, r) => ({ soldNights: a.soldNights + r.soldNights, revenue: a.revenue + r.revenue, availableNights: a.availableNights + r.availableNights }),
    { soldNights: 0, revenue: 0, availableNights: 0 }
  );
}
module.exports = { computeKpis, overlapNights, sumRows, round };
