import { describe, it, expect } from 'vitest';
import { check, bookingSchema, registerSchema, loginSchema, enquirySchema, searchSchema } from '../src/validation';

const future = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

describe('client validation', () => {
  it('rejects check-out on or before check-in', () => {
    const r = check(bookingSchema, { checkIn: future(5), checkOut: future(4), guests: 2 });
    expect(r.ok).toBe(false);
    expect(r.errors.checkOut).toMatch(/after/);
  });
  it('rejects check-in in the past', () => {
    expect(check(bookingSchema, { checkIn: future(-2), checkOut: future(2), guests: 2 }).errors.checkIn).toMatch(/past/);
  });
  it('accepts a valid booking and coerces guests to a number', () => {
    const r = check(bookingSchema, { checkIn: future(3), checkOut: future(5), guests: '2' });
    expect(r.ok).toBe(true);
    expect(r.data.guests).toBe(2);
  });
  it('enforces password strength and email format on sign-up', () => {
    expect(check(registerSchema, { fullName: 'Asha Rao', email: 'bad', password: 'abcdefg1' }).errors.email).toBeTruthy();
    expect(check(registerSchema, { fullName: 'Asha Rao', email: 'a@b.co', password: 'short1' }).errors.password).toBeTruthy();
    expect(check(registerSchema, { fullName: 'Asha Rao', email: 'a@b.co', password: 'longenough1' }).ok).toBe(true);
  });
  it('requires a password to log in', () => {
    expect(check(loginSchema, { email: 'a@b.co', password: '' }).ok).toBe(false);
  });
  it('requires a meaningful enquiry message', () => {
    expect(check(enquirySchema, { name: 'Ravi', email: 'r@x.co', message: 'hi' }).errors.message).toBeTruthy();
  });
  it('search needs both dates or neither', () => {
    expect(check(searchSchema, { checkIn: future(1), checkOut: '' }).ok).toBe(false);
    expect(check(searchSchema, { checkIn: '', checkOut: '' }).ok).toBe(true);
  });
});
