const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../src/services/cleaning');

test('room types renamed across properties map to one canonical name', () => {
  for (const raw of ['Deluxe Sea View', 'Premier Ocean', 'DLX-SV', '  ocean   view room ']) assert.equal(C.normalizeRoomType(raw).canonical, 'Sea View Room');
  assert.equal(C.normalizeRoomType('Sea View Room').note, null);
});
test('unmapped room types are flagged, not guessed', () => {
  const r = C.normalizeRoomType('Banquet Hall');
  assert.equal(r.canonical, null);
  assert.match(r.note, /unmapped/);
});
test('date parsing handles ISO and DD/MM/YYYY and rejects impossible dates', () => {
  assert.equal(C.parseDate('2026-03-14'), '2026-03-14');
  assert.equal(C.parseDate('14/03/2026'), '2026-03-14');
  assert.equal(C.parseDate('14-03-2026'), '2026-03-14');
  assert.equal(C.parseDate('31/02/2026'), null);
  assert.equal(C.parseDate('garbage'), null);
});
test('check-out before check-in is swapped when the stay is plausible', () => {
  const r = C.fixStayDates('2026-03-14', '2026-03-11');
  assert.equal(r.action, 'swapped');
  assert.deepEqual([r.checkIn, r.checkOut, r.nights], ['2026-03-11', '2026-03-14', 3]);
});
test('zero-night, huge and unparseable stays are quarantined', () => {
  assert.equal(C.fixStayDates('2026-03-14', '2026-03-14').action, 'quarantine');
  assert.equal(C.fixStayDates('2026-03-14', '2026-06-14').action, 'quarantine');
  assert.equal(C.fixStayDates('2026-03-14', '2026-02-01').action, 'quarantine'); // reversed AND implausible
  assert.equal(C.fixStayDates('x', '2026-03-14').action, 'quarantine');
});
test('normal stays pass through unchanged', () => {
  const r = C.fixStayDates('14/03/2026', '17/03/2026');
  assert.deepEqual([r.action, r.checkIn, r.checkOut, r.nights], ['ok', '2026-03-14', '2026-03-17', 3]);
});
test('currency conversion: INR kept, USD converted, bad values rejected', () => {
  assert.equal(C.toInr(5000, 'INR').inr, 5000);
  assert.equal(C.toInr(100, 'USD', 83).inr, 8300);
  assert.equal(C.toInr('120.50', 'usd', 83).inr, 10001.5);
  assert.equal(C.toInr('', 'INR').inr, null);
  assert.equal(C.toInr(-5, 'INR').inr, null);
  assert.equal(C.toInr(10, 'EUR').inr, null);
});
test('ratings outside 1..5 are rejected', () => {
  assert.equal(C.cleanRating(4).rating, 4);
  assert.equal(C.cleanRating(11).rating, null);
  assert.equal(C.cleanRating('abc').rating, null);
  assert.equal(C.cleanRating(0).rating, null);
});
test('CSV parser handles quotes, commas and blank fields', () => {
  const rows = C.parseCsv('a,b,c\n1,"x, y",\n"he said ""hi""",2,3\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, y', c: '' }, { a: 'he said "hi"', b: '2', c: '3' }]);
});
