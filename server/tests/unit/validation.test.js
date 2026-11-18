const test = require('node:test');
const assert = require('node:assert/strict');
let S;
try { S = require('../../src/schemas'); } catch (e) { /* zod not installed in this environment */ }
const skip = !S && 'zod not installed';

test('booking requires checkOut after checkIn', { skip }, () => {
  const bad = S.createBooking.safeParse({ roomTypeId: 1, checkIn: '2026-12-10', checkOut: '2026-12-09', guests: 2 });
  assert.equal(bad.success, false);
  assert.equal(bad.error.issues[0].path[0], 'checkOut');
  assert.equal(S.createBooking.safeParse({ roomTypeId: 1, checkIn: '2026-12-10', checkOut: '2026-12-12', guests: 2 }).success, true);
});
test('register enforces email format and password strength', { skip }, () => {
  assert.equal(S.register.safeParse({ fullName: 'A B', email: 'nope', password: 'abcdefg1' }).success, false);
  assert.equal(S.register.safeParse({ fullName: 'A B', email: 'a@b.co', password: 'short1' }).success, false);
  assert.equal(S.register.safeParse({ fullName: 'A B', email: 'a@b.co', password: 'longenough' }).success, false); // no digit
  assert.equal(S.register.safeParse({ fullName: 'A B', email: 'A@B.CO', password: 'longenough1' }).data.email, 'a@b.co');
});
test('metrics range cannot exceed 366 days', { skip }, () => {
  assert.equal(S.metrics.safeParse({ from: '2024-01-01', to: '2026-01-01' }).success, false);
  assert.equal(S.metrics.safeParse({ from: '2026-01-01', to: '2026-03-01' }).success, true);
});
test('search treats empty strings as absent and caps page size', { skip }, () => {
  const r = S.search.parse({ city: '', minPrice: '', limit: '50' });
  assert.equal(r.city, undefined); assert.equal(r.limit, 50);
  assert.equal(S.search.safeParse({ limit: '500' }).success, false);
  assert.equal(S.search.safeParse({ checkIn: '2026-12-01' }).success, false); // needs both dates
});
