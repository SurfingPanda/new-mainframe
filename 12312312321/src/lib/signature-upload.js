import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { InvalidImageError } from './avatar-upload.js';

// E-signatures live under server/uploads/signatures and are served at
// /uploads/signatures/<file>. Like avatars, every upload is decoded + re-encoded
// through sharp (validates real image bytes, rejects spoofed/SVG payloads) and
// normalized to a small WebP. Unlike avatars we keep transparency (a drawn
// signature is a transparent PNG) and fit it inside a wide banner instead of
// cropping to a square, so it overlays cleanly on documents.
export const SIGNATURE_DIR = path.resolve(process.cwd(), 'uploads', 'signatures');
fs.mkdirSync(SIGNATURE_DIR, { recursive: true });

const MAX_W = 600;
const MAX_H = 240;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Signature must be a PNG, JPEG, WebP, HEIC, or AVIF image.'));
    }
    cb(null, true);
  }
});

export function signatureUpload(req, res, next) {
  upload.single('signature')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Signature image is larger than 5 MB.' });
    }
    return res.status(400).json({ error: err.message || 'Could not process the image.' });
  });
}

// Decode/validate/resize and persist as a transparent WebP. Returns the public URL.
export async function saveSignature(buffer) {
  // First crop away the empty (transparent / uniform) margins so a small mark
  // drawn in a big canvas fills the image — otherwise it prints tiny. Best-effort:
  // a uniform/blank image makes trim throw, so fall back to the original bytes.
  let trimmed = buffer;
  try {
    trimmed = await sharp(buffer, { failOn: 'error' }).rotate().trim().png().toBuffer();
  } catch {
    trimmed = buffer;
  }

  let out;
  try {
    out = await sharp(trimmed, { failOn: 'error' })
      .rotate()
      .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 }) // WebP preserves the alpha channel
      .toBuffer();
  } catch {
    throw new InvalidImageError('That file is not a valid image.');
  }
  const filename = `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}.webp`;
  await fs.promises.writeFile(path.join(SIGNATURE_DIR, filename), out);
  return `/uploads/signatures/${filename}`;
}

// Best-effort removal, scoped to SIGNATURE_DIR so a tampered DB value can't escape.
export function removeSignatureFile(url) {
  if (!url) return;
  const filePath = path.join(SIGNATURE_DIR, path.basename(url));
  if (path.dirname(filePath) !== SIGNATURE_DIR) return;
  fs.promises.unlink(filePath).catch(() => {});
}
