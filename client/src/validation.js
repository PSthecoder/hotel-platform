// Client-side validation. The server re-validates everything; these give instant feedback.
import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
export const today = () => new Date().toISOString().slice(0, 10);

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name'),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
});
export const bookingSchema = z
  .object({ checkIn: date, checkOut: date, guests: z.coerce.number().int().min(1, 'At least 1 guest').max(10, 'At most 10 guests') })
  .refine((o) => o.checkIn >= today(), { path: ['checkIn'], message: 'Check-in cannot be in the past' })
  .refine((o) => o.checkOut > o.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' });
export const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  email: z.string().trim().email('Enter a valid email'),
  message: z.string().trim().min(10, 'Please write at least 10 characters').max(1000, 'Too long'),
});
export const searchSchema = z
  .object({ checkIn: z.string(), checkOut: z.string() })
  .refine((o) => (!o.checkIn && !o.checkOut) || (o.checkIn && o.checkOut), { path: ['checkOut'], message: 'Choose both dates' })
  .refine((o) => !o.checkIn || !o.checkOut || o.checkOut > o.checkIn, { path: ['checkOut'], message: 'Check-out must be after check-in' });
export const propertySchema = z.object({ name: z.string().trim().min(2, 'Name is required'), city: z.string().trim().min(2, 'City is required'), address: z.string().max(200).optional() });

/** Returns { ok, data, errors: {field: message} } */
export function check(schema, values) {
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, data: r.data, errors: {} };
  const errors = {};
  for (const i of r.error.issues) errors[i.path[0] ?? '_'] ||= i.message;
  return { ok: false, errors };
}
