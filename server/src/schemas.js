const { z } = require('zod');
const { parseISO } = require('./utils/dates');

const isoDate = z.string().refine((s) => !!parseISO(s), 'must be a valid date (YYYY-MM-DD)');
const password = z.string().min(8, 'at least 8 characters').max(72).regex(/[A-Za-z]/, 'must contain a letter').regex(/\d/, 'must contain a number');
const id = z.coerce.number().int().positive();
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(50).default(12);
const optInt = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int().positive().optional());
const optNum = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().min(0).optional());
const optStr = z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(100).optional());

const dateRange = (o) => o.checkOut > o.checkIn;
const dateMsg = { message: 'checkOut must be after checkIn', path: ['checkOut'] };

module.exports = {
  idParam: z.object({ id }),
  register: z.object({ fullName: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120), password }),
  login: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) }),
  property: z.object({
    name: z.string().trim().min(2).max(100), city: z.string().trim().min(2).max(60),
    address: z.string().trim().max(200).optional().default(''), imageUrl: z.string().url().max(300).optional().nullable(),
  }),
  roomType: z.object({
    propertyId: id, canonicalName: z.string().trim().min(2).max(60), capacity: z.coerce.number().int().min(1).max(10),
    baseRateInr: z.coerce.number().positive().max(1000000), amenities: z.string().max(300).optional().default(''), imageUrl: z.string().url().max(300).optional().nullable(),
  }),
  room: z.object({ roomTypeId: id, roomNo: z.string().trim().min(1).max(10), status: z.enum(['active', 'out_of_service']).default('active') }),
  search: z.object({
    city: optStr, propertyId: optInt, checkIn: z.preprocess((v) => v || undefined, isoDate.optional()), checkOut: z.preprocess((v) => v || undefined, isoDate.optional()),
    guests: optInt, minPrice: optNum, maxPrice: optNum, roomType: optStr, minRating: optNum,
    sort: z.enum(['price_asc', 'price_desc', 'rating']).default('price_asc'), page, limit,
  }).refine((o) => (!o.checkIn && !o.checkOut) || (o.checkIn && o.checkOut && dateRange(o)), { message: 'provide both checkIn and checkOut, with checkOut after checkIn', path: ['checkOut'] }),
  createBooking: z.object({ roomTypeId: id, checkIn: isoDate, checkOut: isoDate, guests: z.coerce.number().int().min(1).max(10), notes: z.string().max(300).optional() }).refine(dateRange, dateMsg),
  patchBooking: z.object({ status: z.enum(['confirmed', 'checked_in', 'completed', 'cancelled']) }),
  listBookings: z.object({ propertyId: optInt, status: optStr, page, limit }),
  createEnquiry: z.object({ propertyId: id, name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(120), message: z.string().trim().min(10).max(1000) }),
  patchEnquiry: z.object({ status: z.enum(['open', 'answered', 'closed']) }),
  createReview: z.object({ bookingId: id, rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional().default(''), imageUrl: z.string().url().max(300).optional().nullable() }),
  reviewQuery: z.object({ propertyId: id }),
  metrics: z.object({ from: isoDate, to: isoDate, propertyId: optInt })
    .refine((o) => o.to >= o.from, { message: 'to must not be before from', path: ['to'] })
    .refine((o) => (Date.parse(o.to) - Date.parse(o.from)) / 864e5 <= 366, { message: 'range cannot exceed 366 days', path: ['to'] }),
};
