/**
 * Pure data-cleaning rules used by the seed pipeline.
 * Every function returns data + (where relevant) a note describing what was changed,
 * so the pipeline can write an auditable data_quality_log.
 */

// Raw room-type names seen across the 14 properties -> one canonical name.
const ROOM_TYPE_ALIASES = {
  'standard': 'Standard Room', 'std': 'Standard Room', 'standard room': 'Standard Room', 'classic room': 'Standard Room',
  'deluxe': 'Deluxe Room', 'dlx': 'Deluxe Room', 'deluxe room': 'Deluxe Room', 'superior room': 'Deluxe Room',
  'deluxe sea view': 'Sea View Room', 'premier ocean': 'Sea View Room', 'dlx-sv': 'Sea View Room', 'ocean view room': 'Sea View Room', 'sea view': 'Sea View Room',
  'executive suite': 'Executive Suite', 'exec suite': 'Executive Suite', 'club suite': 'Executive Suite', 'junior suite': 'Executive Suite',
  'family room': 'Family Room', 'family rm': 'Family Room', 'quad room': 'Family Room',
  'presidential suite': 'Presidential Suite', 'pres suite': 'Presidential Suite', 'royal suite': 'Presidential Suite',
};
const normKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// Canonical names are valid inputs too.
for (const canon of new Set(Object.values(ROOM_TYPE_ALIASES))) ROOM_TYPE_ALIASES[normKey(canon)] = canon;

/** @returns {{canonical: string|null, note: string|null}} null canonical = unmapped, needs manual review. */
function normalizeRoomType(raw) {
  const canonical = ROOM_TYPE_ALIASES[normKey(raw)] || null;
  if (!canonical) return { canonical: null, note: `unmapped room type "${raw}"` };
  const changed = canonical !== String(raw).trim();
  return { canonical, note: changed ? `renamed "${raw}" -> "${canonical}"` : null };
}

/** Accepts YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY (day first, as used by the Indian properties). */
function parseDate(s) {
  const t = String(s || '').trim();
  let y, m, d;
  let mt;
  if ((mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) [, y, m, d] = mt;
  else if ((mt = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(t))) [, d, m, y] = mt;
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return dt.toISOString().slice(0, 10);
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/**
 * Resolve check-in / check-out.
 *  - check_out after check_in  -> ok
 *  - check_out before check_in and the gap is a plausible stay (<= maxStay) -> swap and log
 *  - equal dates, unparseable dates, or implausible gap -> quarantine
 */
function fixStayDates(rawIn, rawOut, maxStay = 30) {
  const ci = parseDate(rawIn);
  const co = parseDate(rawOut);
  if (!ci || !co) return { action: 'quarantine', note: `unparseable dates "${rawIn}" / "${rawOut}"` };
  const diff = daysBetween(ci, co);
  if (diff > 0) return diff > maxStay ? { action: 'quarantine', note: `stay of ${diff} nights exceeds ${maxStay}` } : { action: 'ok', checkIn: ci, checkOut: co, nights: diff };
  if (diff === 0) return { action: 'quarantine', note: 'check-in equals check-out (0 nights)' };
  if (-diff <= maxStay) return { action: 'swapped', checkIn: co, checkOut: ci, nights: -diff, note: `check-out ${co} before check-in ${ci}: swapped` };
  return { action: 'quarantine', note: `check-out ${co} before check-in ${ci} with implausible gap` };
}

/** Convert an amount to INR. Unknown/missing currency or non-positive amount -> null. */
function toInr(amount, currency, usdInr = 83) {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return { inr: null, note: `invalid amount "${amount}"` };
  const cur = String(currency || 'INR').trim().toUpperCase();
  if (cur === 'INR') return { inr: Math.round(a * 100) / 100, note: null };
  if (cur === 'USD') return { inr: Math.round(a * usdInr * 100) / 100, note: `converted USD ${a} at ${usdInr}` };
  return { inr: null, note: `unsupported currency "${currency}"` };
}

/** Ratings outside 1..5 are dropped (the text review is kept). */
function cleanRating(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? { rating: n, note: null } : { rating: null, note: `invalid rating "${v}" dropped` };
}

/** Minimal CSV parser (handles quoted fields, escaped quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

module.exports = { normalizeRoomType, parseDate, fixStayDates, toInr, cleanRating, parseCsv, ROOM_TYPE_ALIASES };
