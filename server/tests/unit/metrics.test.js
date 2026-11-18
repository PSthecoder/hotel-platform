const test = require('node:test');
const assert = require('node:assert/strict');
const { computeKpis, overlapNights, sumRows } = require('../../src/services/metrics');

test('worked example from the report: 40 rooms x 30 days', () => {
  const k = computeKpis({ soldNights: 840, revenue: 3_360_000, availableNights: 1200 });
  assert.deepEqual(k, { occupancyPct: 70, adr: 4000, revpar: 2800 });
});
test('RevPAR equals ADR x occupancy', () => {
  const k = computeKpis({ soldNights: 333, revenue: 1_234_567, availableNights: 900 });
  assert.ok(Math.abs(k.revpar - k.adr * (k.occupancyPct / 100)) < 1);
});
test('zero denominators never produce NaN or Infinity', () => {
  assert.deepEqual(computeKpis({ soldNights: 0, revenue: 0, availableNights: 0 }), { occupancyPct: 0, adr: 0, revpar: 0 });
  assert.deepEqual(computeKpis({ soldNights: 0, revenue: 0, availableNights: 100 }), { occupancyPct: 0, adr: 0, revpar: 0 });
});
test('group KPIs are computed from summed numerators, not averaged percentages', () => {
  const rows = [{ soldNights: 90, revenue: 90000, availableNights: 100 }, { soldNights: 10, revenue: 20000, availableNights: 300 }];
  assert.equal(computeKpis(sumRows(rows)).occupancyPct, 25); // 100/400, not the average of 90% and 3.3%
});
test('overlapNights pro-rates stays crossing the period boundary', () => {
  assert.equal(overlapNights('2026-10-29', '2026-11-03', '2026-11-01', '2026-11-30'), 2); // 1st and 2nd
  assert.equal(overlapNights('2026-11-29', '2026-12-04', '2026-11-01', '2026-11-30'), 2); // 29th and 30th (to is inclusive)
  assert.equal(overlapNights('2026-12-01', '2026-12-05', '2026-11-01', '2026-11-30'), 0);
  assert.equal(overlapNights('2026-11-10', '2026-11-12', '2026-11-01', '2026-11-30'), 2);
});
