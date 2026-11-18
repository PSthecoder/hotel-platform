/**
 * Generates deterministic, deliberately MESSY raw CSVs that mimic exports from 14 properties:
 *  - the same room category named differently per property (aliases)
 *  - rates in INR and USD
 *  - check-out dates before check-in, zero-night stays, duplicated rows, blank amounts
 *  - mixed date formats (ISO vs DD/MM/YYYY) and invalid ratings
 * Usage: node scripts/generate-raw-data.js [YYYY-MM-DD as "today"]
 * Output: db/raw/*.csv (git-ignored; regenerated on demand)
 */
const fs = require('fs');
const path = require('path');

const today = process.argv[2] || new Date().toISOString().slice(0, 10);
let seed = 20260101;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
const fmt = (iso, style) => (style === 'dmy' ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

const PROPS = [
  ['P01', 'The Marine Lines Residency', 'Marine Drive'], ['P02', 'Colaba Courtyard', 'Colaba Causeway'], ['P03', 'Bandra Bay Boutique', 'Bandstand, Bandra West'],
  ['P04', 'Juhu Shore House', 'Juhu Tara Road'], ['P05', 'Worli Sky Suites', 'Dr Annie Besant Road, Worli'], ['P06', 'Powai Lakeside Inn', 'Hiranandani Gardens, Powai'],
  ['P07', 'Fort Heritage Haveli', 'Horniman Circle, Fort'], ['P08', 'Andheri Airport Stay', 'Sahar Road, Andheri East'], ['P09', 'Kala Ghoda Gallery Hotel', 'Kala Ghoda'],
  ['P10', 'Lower Parel Loft', 'Senapati Bapat Marg'], ['P11', 'Versova Beach Nook', 'Versova Link Road'], ['P12', 'Chembur Garden Hotel', 'Tilak Nagar, Chembur'],
  ['P13', 'Dadar Station Lodge', 'Tilak Road, Dadar'], ['P14', 'Malabar Hill Retreat', 'Walkeshwar Road'],
];
// canonical -> [base INR, capacity, alias variants used by different properties]
const TYPES = [
  ['Standard Room', 4500, 2, ['Standard', 'STD', 'Classic Room', 'Standard Room']],
  ['Deluxe Room', 6500, 3, ['Deluxe', 'DLX', 'Superior Room', 'Deluxe Room']],
  ['Sea View Room', 8800, 3, ['Deluxe Sea View', 'Premier Ocean', 'DLX-SV', 'Ocean View Room', 'Sea View']],
  ['Executive Suite', 12500, 4, ['Executive Suite', 'Exec Suite', 'Club Suite', 'Junior Suite']],
  ['Family Room', 9000, 5, ['Family Room', 'Family Rm', 'Quad Room']],
  ['Presidential Suite', 26000, 4, ['Presidential Suite', 'Pres Suite', 'Royal Suite']],
];
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Kabir', 'Anaya', 'Diya', 'Meera', 'Saanvi', 'Zoya', 'Rohan', 'Neha', 'Arjun', 'Priya', 'Karan', 'Sneha', 'John', 'Emma', 'Liam', 'Sofia', 'Noah', 'Mia'];
const LAST = ['Sharma', 'Patel', 'Iyer', 'Khan', 'Mehta', 'Desai', 'Nair', 'Gupta', 'Joshi', 'Reddy', 'Smith', 'Brown', 'Taylor', 'Wilson', 'Fernandes', 'DSouza'];
const GOOD = ['Spotless room and friendly staff', 'Great location and quick check-in', 'Loved the breakfast and the view', 'Comfortable bed and quiet floor', 'Excellent value for money'];
const MID = ['Decent stay but the lift was slow', 'Room was fine and service average', 'Good location although a bit noisy'];
const BAD = ['AC was not working properly', 'Check-in took too long', 'Room smelled damp'];

const guests = Array.from({ length: 700 }, (_, i) => {
  const f = pick(FIRST), l = pick(LAST);
  return { name: `${f} ${l}`, email: `${f}.${l}${i}@example.com`.toLowerCase() };
});
const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (head, rows) => [head.join(','), ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n';

const properties = [], inventory = [], bookings = [], reviews = [];
const start = addDays(today, -150), end = addDays(today, 60);
let ref = 100000;

PROPS.forEach(([code, name, address], pi) => {
  properties.push([code, name, 'Mumbai', address]);
  const style = pi % 3 === 0 ? 'dmy' : 'iso';           // some properties export DD/MM/YYYY
  const usdProperty = pi === 3 || pi === 8;              // two properties quote inventory in USD
  const mult = 0.8 + (pi % 7) * 0.1;
  const typeCount = 4 + (pi % 3);                        // 4..6 types per property
  let roomNo = 100;
  TYPES.slice(0, typeCount).forEach(([canon, baseInr, , variants], ti) => {
    const alias = variants[(pi + ti) % variants.length];
    const rooms = int(2, 5);
    const rateInr = Math.round((baseInr * mult) / 50) * 50;
    for (let r = 0; r < rooms; r++) {
      roomNo += 1;
      const rate = usdProperty ? Math.round(rateInr / 83) : rateInr;
      inventory.push([code, alias, String(roomNo), r === 0 && rnd() < 0.05 ? '' : rate, usdProperty ? 'USD' : 'INR']);
      // Bookings for this room: back-to-back stays with random gaps.
      let cursor = addDays(start, int(0, 5));
      while (cursor < end) {
        const nights = int(1, 6);
        const ci = cursor, co = addDays(cursor, nights);
        cursor = addDays(co, int(0, 4));
        ref += 1;
        const g = pick(guests);
        const usdBooking = usdProperty || rnd() < 0.08;
        const total = Math.round(rateInr * nights * (rnd() < 0.3 ? 1.1 : 1));
        const amount = usdBooking ? Math.round((total / 83) * 100) / 100 : total;
        let a = ci, b = co;
        const roll = rnd();
        if (roll < 0.03) { a = co; b = ci; }              // check-out BEFORE check-in
        else if (roll < 0.035) { b = ci; }                // zero-night stay
        const email = rnd() < 0.05 ? ` ${g.email.toUpperCase()} ` : g.email;
        const row = [`BK${ref}`, code, alias, String(roomNo), g.name, email, fmt(a, style), fmt(b, style), rnd() < 0.01 ? '' : amount, usdBooking ? 'USD' : 'INR'];
        bookings.push(row);
        if (rnd() < 0.01) bookings.push(row);             // exact duplicate export
        if (co < today && rnd() < 0.35) {
          const rating = rnd() < 0.02 ? 11 : Math.min(5, Math.max(1, Math.round(4.1 + (rnd() - 0.5) * 3)));
          reviews.push([`BK${ref}`, rating, rating >= 4 ? pick(GOOD) : rating === 3 ? pick(MID) : pick(BAD)]);
        }
      }
    }
  });
});

const dir = path.join(__dirname, '..', 'db', 'raw');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'properties.csv'), csv(['property_code', 'name', 'city', 'address'], properties));
fs.writeFileSync(path.join(dir, 'inventory.csv'), csv(['property_code', 'room_type_raw', 'room_no', 'base_rate', 'currency'], inventory));
fs.writeFileSync(path.join(dir, 'bookings.csv'), csv(['booking_ref', 'property_code', 'room_type_raw', 'room_no', 'guest_name', 'guest_email', 'check_in', 'check_out', 'amount', 'currency'], bookings));
fs.writeFileSync(path.join(dir, 'reviews.csv'), csv(['booking_ref', 'rating', 'comment'], reviews));
console.log(`Generated raw data around ${today}: ${properties.length} properties, ${inventory.length} rooms, ${bookings.length} booking rows, ${reviews.length} reviews`);
