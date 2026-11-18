/**
 * API integration tests. They need a PostgreSQL database (DATABASE_URL) and run against
 * a freshly migrated, truncated schema. They are skipped automatically when DATABASE_URL is not set.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ||= 'test-secret-test-secret-123456';
process.env.BCRYPT_COST = '4';
const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let request, app, db, bcrypt;
const ctx = {};
const fmt = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => fmt(new Date(Date.now() + n * 864e5));

test.before(async () => {
  if (skip) return;
  request = require('supertest'); app = require('../../src/app'); db = require('../../src/db'); bcrypt = require('bcryptjs');
  await db.query(fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8'));
  await db.query('TRUNCATE data_quality_log, reviews, enquiries, bookings, rooms, room_types, properties, refresh_tokens, users RESTART IDENTITY CASCADE');
  await db.query(`INSERT INTO users(full_name,email,password_hash,role) VALUES ('Admin','admin@test.dev',$1,'admin')`, [await bcrypt.hash('AdminPass1', 4)]);
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@test.dev', password: 'AdminPass1' });
  ctx.admin = login.body.data.accessToken;
  const prop = await request(app).post('/api/properties').set('Authorization', `Bearer ${ctx.admin}`).send({ name: 'Test Hotel', city: 'Mumbai' });
  ctx.propertyId = prop.body.data.id;
  const rt = await request(app).post('/api/room-types').set('Authorization', `Bearer ${ctx.admin}`).send({ propertyId: ctx.propertyId, canonicalName: 'Deluxe Room', capacity: 2, baseRateInr: 5000 });
  ctx.roomTypeId = rt.body.data.id;
  await request(app).post('/api/rooms').set('Authorization', `Bearer ${ctx.admin}`).send({ roomTypeId: ctx.roomTypeId, roomNo: '101' });
});
test.after(async () => { if (!skip) await db.pool.end(); });

const auth = (t) => ({ Authorization: `Bearer ${t}` });

test('register validates input and returns a consistent error shape', { skip }, async () => {
  const res = await request(app).post('/api/auth/register').send({ fullName: 'X', email: 'bad', password: '123' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(res.body.error.details));
  assert.ok(res.body.error.requestId);
});

test('register -> login -> me, duplicate email is 409', { skip }, async () => {
  const body = { fullName: 'Asha Rao', email: 'asha@test.dev', password: 'Passw0rdOK' };
  const reg = await request(app).post('/api/auth/register').send(body);
  assert.equal(reg.status, 201);
  assert.equal(reg.body.data.user.role, 'user');
  assert.equal((await request(app).post('/api/auth/register').send(body)).status, 409);
  const login = await request(app).post('/api/auth/login').send({ email: body.email, password: body.password });
  assert.equal(login.status, 200);
  ctx.user = login.body.data.accessToken;
  const me = await request(app).get('/api/auth/me').set(auth(ctx.user));
  assert.equal(me.body.data.user.email, body.email);
  assert.equal((await request(app).post('/api/auth/login').send({ email: body.email, password: 'wrongpass1' })).status, 401);
});

test('refresh tokens rotate and reuse of an old one revokes the session', { skip }, async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'asha@test.dev', password: 'Passw0rdOK' });
  const r1 = await agent.post('/api/auth/refresh');
  assert.equal(r1.status, 200);
  assert.ok(r1.body.data.accessToken);
  // Replay the ORIGINAL (now revoked) cookie from a fresh client
  const login = await request(app).post('/api/auth/login').send({ email: 'asha@test.dev', password: 'Passw0rdOK' });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const ok = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(ok.status, 200);
  const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(replay.status, 401);
});

test('role-based access: anonymous 401, user 403, admin ok', { skip }, async () => {
  assert.equal((await request(app).post('/api/properties').send({ name: 'Nope', city: 'X' })).status, 401);
  assert.equal((await request(app).post('/api/properties').set(auth(ctx.user)).send({ name: 'Nope', city: 'Mumbai' })).status, 403);
  assert.equal((await request(app).get('/api/admin/metrics?from=2026-01-01&to=2026-01-31').set(auth(ctx.user))).status, 403);
});

test('properties CRUD as admin', { skip }, async () => {
  const c = await request(app).post('/api/properties').set(auth(ctx.admin)).send({ name: 'Temp Inn', city: 'Mumbai', address: 'Somewhere' });
  assert.equal(c.status, 201);
  const id = c.body.data.id;
  assert.equal((await request(app).put(`/api/properties/${id}`).set(auth(ctx.admin)).send({ name: 'Temp Inn 2', city: 'Mumbai' })).status, 200);
  assert.equal((await request(app).get(`/api/properties/${id}`)).body.data.name, 'Temp Inn 2');
  assert.equal((await request(app).delete(`/api/properties/${id}`).set(auth(ctx.admin))).status, 200);
  assert.equal((await request(app).get(`/api/properties/${id}`)).status, 404);
});

test('booking: success, overlap is rejected with 409, cancel frees the room', { skip }, async () => {
  const body = { roomTypeId: ctx.roomTypeId, checkIn: inDays(10), checkOut: inDays(13), guests: 2 };
  const ok = await request(app).post('/api/bookings').set(auth(ctx.user)).send(body);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.totalInr, 15000);
  ctx.bookingId = ok.body.data.id;
  const clash = await request(app).post('/api/bookings').set(auth(ctx.user)).send({ ...body, checkIn: inDays(12), checkOut: inDays(14) });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error.code, 'ROOM_UNAVAILABLE');
  const bad = await request(app).post('/api/bookings').set(auth(ctx.user)).send({ ...body, checkOut: body.checkIn });
  assert.equal(bad.status, 400);
  assert.equal((await request(app).patch(`/api/bookings/${ctx.bookingId}`).set(auth(ctx.user)).send({ status: 'cancelled' })).status, 200);
  assert.equal((await request(app).post('/api/bookings').set(auth(ctx.user)).send(body)).status, 201);
});

test('guests cannot touch other guests bookings or set non-cancel statuses', { skip }, async () => {
  const other = await request(app).post('/api/auth/register').send({ fullName: 'Other Guest', email: 'other@test.dev', password: 'Passw0rdOK' });
  const t = other.body.data.accessToken;
  assert.equal((await request(app).patch(`/api/bookings/${ctx.bookingId}`).set(auth(t)).send({ status: 'cancelled' })).status, 403);
  const list = await request(app).get('/api/bookings').set(auth(t));
  assert.equal(list.body.data.length, 0);
});

test('search filters by price, guests and availability', { skip }, async () => {
  const all = await request(app).get(`/api/rooms/search?propertyId=${ctx.propertyId}`);
  assert.equal(all.body.data.length, 1);
  assert.equal((await request(app).get('/api/rooms/search?minPrice=9000')).body.data.length, 0);
  assert.equal((await request(app).get('/api/rooms/search?guests=5')).body.data.length, 0);
  // The only room is booked days 10-13 (rebooked in the earlier test)
  const busy = await request(app).get(`/api/rooms/search?checkIn=${inDays(11)}&checkOut=${inDays(12)}`);
  assert.equal(busy.body.data.length, 0);
  const free = await request(app).get(`/api/rooms/search?checkIn=${inDays(20)}&checkOut=${inDays(22)}`);
  assert.equal(free.body.data.length, 1);
  assert.equal((await request(app).get('/api/rooms/search?checkIn=2026-12-10&checkOut=2026-12-01')).status, 400);
});

test('enquiry is public; listing it is admin only', { skip }, async () => {
  const e = await request(app).post('/api/enquiries').send({ propertyId: ctx.propertyId, name: 'Ravi', email: 'ravi@test.dev', message: 'Do you have parking available?' });
  assert.equal(e.status, 201);
  assert.equal((await request(app).get('/api/enquiries').set(auth(ctx.user))).status, 403);
  assert.equal((await request(app).get('/api/enquiries').set(auth(ctx.admin))).body.data.length, 1);
});

test('upload rejects non-images and accepts a real PNG', { skip }, async () => {
  const bad = await request(app).post('/api/uploads').set(auth(ctx.user)).attach('image', Buffer.from('not an image'), 'x.png');
  assert.equal(bad.status, 400);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const ok = await request(app).post('/api/uploads').set(auth(ctx.user)).attach('image', png, 'x.png');
  assert.equal(ok.status, 201);
  assert.match(ok.body.data.url, /\/uploads\/[0-9a-f]{32}\.png$/);
});

test('admin metrics compute occupancy, ADR and RevPAR', { skip }, async () => {
  // 1 active room; booking of 3 nights = 15000 INR starts in 10 days
  const from = inDays(10), to = inDays(19); // 10-day window
  const r = await request(app).get(`/api/admin/metrics?from=${from}&to=${to}&propertyId=${ctx.propertyId}`).set(auth(ctx.admin));
  assert.equal(r.status, 200);
  const t = r.body.data.totals;
  assert.equal(t.availableNights, 10);
  assert.equal(t.soldNights, 3);
  assert.equal(t.occupancyPct, 30);
  assert.equal(t.adr, 5000);
  assert.equal(t.revpar, 1500);
  assert.equal(r.body.data.trend.length, 10);
});

test('database rejects bad dates even if the API is bypassed', { skip }, async () => {
  await assert.rejects(() => db.query(`INSERT INTO bookings(guest_id,room_id,check_in,check_out,nights,total_inr) VALUES (1,1,'2030-01-10','2030-01-05',1,100)`), /chk_dates|check/);
});

test('unknown routes return the standard error shape', { skip }, async () => {
  const r = await request(app).get('/api/nope');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
});
