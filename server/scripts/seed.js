/**
 * Seed pipeline: extract (CSV) -> transform (clean + log) -> load (PostgreSQL, one transaction).
 * Usage: npm run seed        (generates raw CSVs first if db/raw is missing)
 * WARNING: truncates all data tables. Refuses to run in production unless ALLOW_SEED=true.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const bcrypt = require('bcryptjs');
const cfg = require('../src/config');
const db = require('../src/db');
const C = require('../src/services/cleaning');
const { nightsBetween } = require('../src/utils/dates');

const RAW = path.join(__dirname, '..', 'db', 'raw');
const read = (f) => C.parseCsv(fs.readFileSync(path.join(RAW, f), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

(async () => {
  if (cfg.isProd && process.env.ALLOW_SEED !== 'true') throw new Error('Refusing to seed in production (set ALLOW_SEED=true to override)');
  if (!fs.existsSync(path.join(RAW, 'bookings.csv'))) execFileSync('node', [path.join(__dirname, 'generate-raw-data.js'), today], { stdio: 'inherit' });
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

  const log = []; // data_quality_log rows: [source, ref, issue, action]
  const stats = { properties: 0, rooms: 0, roomTypes: 0, bookingsRead: 0, bookingsLoaded: 0, corrected: 0, quarantined: 0, duplicates: 0, reviewsRead: 0, reviewsLoaded: 0 };

  await db.tx(async (c) => {
    await c.query('TRUNCATE data_quality_log, reviews, enquiries, bookings, rooms, room_types, properties, refresh_tokens, users RESTART IDENTITY CASCADE');

    // ---- users: admin + demo guest ----
    const adminPw = cfg.adminPassword || (cfg.isProd ? null : 'Admin@12345');
    if (!adminPw) throw new Error('ADMIN_PASSWORD must be set to seed in production');
    await c.query(`INSERT INTO users(full_name,email,password_hash,role) VALUES ('Front Desk Admin',$1,$2,'admin')`, [cfg.adminEmail || 'admin@hotel.test', await bcrypt.hash(adminPw, cfg.bcryptCost)]);
    if (!cfg.isProd) await c.query(`INSERT INTO users(full_name,email,password_hash,role) VALUES ('Demo Guest','guest@hotel.test',$1,'user')`, [await bcrypt.hash('Guest@12345', cfg.bcryptCost)]);

    // ---- properties ----
    const propId = {};
    for (const p of read('properties.csv')) {
      const { rows: [r] } = await c.query('INSERT INTO properties(code,name,city,address) VALUES ($1,$2,$3,$4) RETURNING id', [p.property_code, p.name, p.city, p.address]);
      propId[p.property_code] = r.id; stats.properties++;
    }

    // ---- inventory: normalise room types, convert rates ----
    const typeId = {};     // `${code}|${canonical}` -> id
    const typeRate = {};   // id -> base rate INR
    const roomByNo = {};   // `${code}|${roomNo}` -> { id, typeId }
    const pendingRooms = [];
    const rates = {};      // type key -> rates seen
    for (const r of read('inventory.csv')) {
      const ref = `${r.property_code}/${r.room_no}`;
      const { canonical, note } = C.normalizeRoomType(r.room_type_raw);
      if (!canonical) { log.push(['inventory', ref, note, 'row skipped for manual review']); stats.quarantined++; continue; }
      if (note) log.push(['inventory', ref, note, 'normalised']);
      const key = `${r.property_code}|${canonical}`;
      const { inr, note: n2 } = C.toInr(r.base_rate, r.currency, cfg.usdInr);
      if (inr !== null) (rates[key] ||= []).push(inr);
      if (n2) log.push(['inventory', ref, n2, inr === null ? 'rate ignored; type rate taken from sibling rooms' : 'converted to INR']);
      pendingRooms.push({ key, code: r.property_code, roomNo: r.room_no });
    }
    for (const key of new Set(pendingRooms.map((r) => r.key))) {
      const [code, canon] = key.split('|');
      const list = rates[key];
      if (!list?.length) { log.push(['inventory', key, 'no valid rate for any room of this type', 'type skipped']); continue; }
      const rate = list.sort((a, b) => a - b)[Math.floor(list.length / 2)];
      const capacity = { 'Standard Room': 2, 'Deluxe Room': 3, 'Sea View Room': 3, 'Executive Suite': 4, 'Family Room': 5, 'Presidential Suite': 4 }[canon] || 2;
      const { rows: [t] } = await c.query('INSERT INTO room_types(property_id,canonical_name,capacity,base_rate_inr,amenities) VALUES ($1,$2,$3,$4,$5) RETURNING id', [propId[code], canon, capacity, rate, 'WiFi, Air conditioning, Breakfast']);
      typeId[key] = t.id; typeRate[t.id] = rate; stats.roomTypes++;
    }
    for (const r of pendingRooms) {
      if (!typeId[r.key]) continue;
      const { rows: [room] } = await c.query('INSERT INTO rooms(room_type_id,room_no) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id', [typeId[r.key], r.roomNo]);
      if (room) { roomByNo[`${r.code}|${r.roomNo}`] = { id: room.id, typeId: typeId[r.key] }; stats.rooms++; }
    }

    // ---- bookings: clean ----
    const rows = read('bookings.csv');
    stats.bookingsRead = rows.length;
    const seenRef = new Set();
    const good = [];
    for (const b of rows) {
      if (seenRef.has(b.booking_ref)) { stats.duplicates++; log.push(['bookings', b.booking_ref, 'duplicate row', 'removed']); continue; }
      seenRef.add(b.booking_ref);
      const room = roomByNo[`${b.property_code}|${b.room_no}`];
      if (!room) { stats.quarantined++; log.push(['bookings', b.booking_ref, `unknown room ${b.property_code}/${b.room_no}`, 'quarantined']); continue; }
      const d = C.fixStayDates(b.check_in, b.check_out);
      if (d.action === 'quarantine') { stats.quarantined++; log.push(['bookings', b.booking_ref, d.note, 'quarantined']); continue; }
      if (d.action === 'swapped') { stats.corrected++; log.push(['bookings', b.booking_ref, d.note, 'dates swapped']); }
      let { inr, note } = C.toInr(b.amount, b.currency, cfg.usdInr);
      if (inr === null) {
        inr = Math.round(d.nights * typeRate[room.typeId] * 100) / 100;
        stats.corrected++; log.push(['bookings', b.booking_ref, note, 'used room-type base rate x nights']);
      } else if (note) { stats.corrected++; log.push(['bookings', b.booking_ref, note, 'converted to INR']); }
      const email = b.guest_email.trim().toLowerCase();
      if (email !== b.guest_email) log.push(['bookings', b.booking_ref, 'email had spaces/uppercase', 'normalised']);
      const status = d.checkOut <= today ? 'completed' : d.checkIn <= today ? 'checked_in' : 'confirmed';
      good.push({ ref: b.booking_ref, roomId: room.id, email, name: b.guest_name, ci: d.checkIn, co: d.checkOut, nights: d.nights, inr, cur: b.currency.toUpperCase() || 'INR', amount: Number(b.amount) || null, status });
    }
    // ---- bookings: drop overlaps per room (the DB would reject them anyway) ----
    good.sort((a, b) => a.roomId - b.roomId || a.ci.localeCompare(b.ci));
    const clean = [];
    let lastRoom = null, lastEnd = '';
    for (const g of good) {
      if (g.roomId === lastRoom && g.ci < lastEnd) { stats.quarantined++; log.push(['bookings', g.ref, `overlaps another stay in room ${g.roomId}`, 'quarantined']); continue; }
      lastRoom = g.roomId; lastEnd = g.co; clean.push(g);
    }

    // ---- guests ----
    const placeholder = await bcrypt.hash(require('crypto').randomBytes(16).toString('hex'), 4); // unusable password: seeded guests cannot log in
    const guestId = {};
    const emails = [...new Set(clean.map((g) => g.email))];
    const names = Object.fromEntries(clean.map((g) => [g.email, g.name]));
    for (let i = 0; i < emails.length; i += 500) {
      const part = emails.slice(i, i + 500);
      const { rows: out } = await c.query(`INSERT INTO users(full_name,email,password_hash) SELECT * FROM unnest($1::text[],$2::text[],$3::text[]) RETURNING id,email`, [part.map((e) => names[e]), part, part.map(() => placeholder)]);
      out.forEach((u) => (guestId[u.email] = u.id));
    }

    // ---- load bookings in batches ----
    for (let i = 0; i < clean.length; i += 500) {
      const p = clean.slice(i, i + 500);
      await c.query(
        `INSERT INTO bookings(external_ref,guest_id,room_id,check_in,check_out,nights,total_inr,original_amount,original_currency,status,source)
         SELECT * FROM unnest($1::text[],$2::int[],$3::int[],$4::date[],$5::date[],$6::int[],$7::numeric[],$8::numeric[],$9::text[],$10::text[],$11::text[])`,
        [p.map((g) => g.ref), p.map((g) => guestId[g.email]), p.map((g) => g.roomId), p.map((g) => g.ci), p.map((g) => g.co), p.map((g) => g.nights), p.map((g) => g.inr), p.map((g) => g.amount), p.map((g) => g.cur), p.map((g) => g.status), p.map(() => 'import')]);
    }
    stats.bookingsLoaded = clean.length;

    // ---- reviews ----
    const { rows: bk } = await c.query(`SELECT b.id, b.external_ref, b.guest_id, b.status, rt.property_id FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id`);
    const byRef = Object.fromEntries(bk.map((b) => [b.external_ref, b]));
    const revs = [];
    for (const r of read('reviews.csv')) {
      stats.reviewsRead++;
      const b = byRef[r.booking_ref];
      if (!b || b.status !== 'completed') { stats.quarantined++; log.push(['reviews', r.booking_ref, 'review for missing or incomplete booking', 'quarantined']); continue; }
      const { rating, note } = C.cleanRating(r.rating);
      if (rating === null) { stats.quarantined++; log.push(['reviews', r.booking_ref, note, 'review quarantined']); continue; }
      revs.push([b.id, b.property_id, b.guest_id, rating, r.comment]);
    }
    for (let i = 0; i < revs.length; i += 500) {
      const p = revs.slice(i, i + 500);
      await c.query('INSERT INTO reviews(booking_id,property_id,user_id,rating,comment) SELECT * FROM unnest($1::int[],$2::int[],$3::int[],$4::int[],$5::text[])', [0, 1, 2, 3, 4].map((k) => p.map((r) => r[k])));
    }
    stats.reviewsLoaded = revs.length;

    // ---- audit log ----
    for (let i = 0; i < log.length; i += 1000) {
      const p = log.slice(i, i + 1000);
      await c.query('INSERT INTO data_quality_log(source,row_ref,issue,action) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[])', [0, 1, 2, 3].map((k) => p.map((r) => r[k])));
    }
  });

  console.log('\nSeed complete');
  console.table(stats);
  console.log(`Data-quality log entries: ${log.length}`);
  console.log(`Admin login: ${cfg.adminEmail || 'admin@hotel.test'}${cfg.isProd ? '' : ' / (ADMIN_PASSWORD or Admin@12345)'}   Demo guest: guest@hotel.test / Guest@12345`);
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
