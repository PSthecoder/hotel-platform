const nodemailer = require('nodemailer');
const cfg = require('../config');
const logger = require('../logger');

// Without SMTP settings, emails are rendered as JSON and logged (safe for dev/demo).
const transport = cfg.smtp.host
  ? nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined })
  : nodemailer.createTransport({ jsonTransport: true });

async function sendMail({ to, subject, text }) {
  const info = await transport.sendMail({ from: cfg.mailFrom, to, subject, text });
  logger.info('Email sent', { to, subject, messageId: info.messageId });
}

const inr = (n) => `INR ${Number(n).toLocaleString('en-IN')}`;
const templates = {
  'booking-confirmation': (d) => ({ to: d.email, subject: `Booking #${d.id} confirmed – ${d.propertyName}`, text: `Hello ${d.name},\n\nYour stay at ${d.propertyName} (${d.roomType}) is confirmed.\nCheck-in: ${d.checkIn}\nCheck-out: ${d.checkOut}\nTotal: ${inr(d.totalInr)} (pay at hotel)\n\nThank you for choosing us.` }),
  'booking-cancelled': (d) => ({ to: d.email, subject: `Booking #${d.id} cancelled`, text: `Hello ${d.name},\n\nYour booking #${d.id} at ${d.propertyName} (${d.checkIn} to ${d.checkOut}) has been cancelled.` }),
  'enquiry-received': (d) => ({ to: d.adminEmail || cfg.adminEmail || 'frontdesk@example.com', subject: `New enquiry for ${d.propertyName}`, text: `From: ${d.name} <${d.email}>\n\n${d.message}` }),
};
async function handle(name, data) {
  const t = templates[name];
  if (!t) throw new Error(`Unknown job ${name}`);
  await sendMail(t(data));
}
module.exports = { handle, templates };
