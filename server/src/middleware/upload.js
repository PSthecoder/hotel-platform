const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');
const { badRequest } = require('../utils/errors');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).single('image');

/** Check the real file signature (magic bytes) instead of trusting the extension/mimetype. */
function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
function saveUpload(buf) {
  const ext = detectType(buf);
  if (!ext) throw badRequest('Only JPEG, PNG or WebP images are allowed');
  const dir = path.resolve(cfg.uploadDir);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}
module.exports = { upload, saveUpload, detectType };
