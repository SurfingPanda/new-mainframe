import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Profile pictures live under server/uploads/avatars and are served statically
// at /uploads/avatars/<file> (see index.js). Every upload is decoded and
// re-encoded through sharp, which (a) validates that the bytes are a real image
// — a spoofed MIME type or an SVG/script payload fails to decode and is
// rejected — and (b) normalizes the result to a small, web-safe WebP.
export const AVATAR_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const AVATAR_SIZE = 256; // square, px
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Cheap first gate on the client-declared MIME (sharp is the real validator).
// HEIC/AVIF are allowed because libvips can decode them; we still re-encode to
// WebP so the stored avatar renders in every browser.
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
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
      return cb(new Error('Profile picture must be a PNG, JPEG, GIF, WebP, HEIC, or AVIF image.'));
    }
    cb(null, true);
  }
});

// Wrap upload.single('avatar') so multer's size/MIME errors come back as JSON
// (400) instead of falling through to the generic 500 handler.
export function avatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Profile picture is larger than 5 MB.' });
    }
    return res.status(400).json({ error: err.message || 'Could not process the image.' });
  });
}

// Decode/validate/resize an uploaded buffer and persist it as a square WebP.
// Returns the public URL. Throws if the buffer is not a decodable image, so
// callers should treat a rejection as a 400 (see InvalidImageError).
export class InvalidImageError extends Error {}

export async function saveAvatar(buffer) {
  let out;
  try {
    out = await sharp(buffer, { failOn: 'error' })
      .rotate() // honor EXIF orientation before cropping
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new InvalidImageError('That file is not a valid image.');
  }
  const filename = `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}.webp`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, filename), out);
  return `/uploads/avatars/${filename}`;
}

// Best-effort removal of a previously stored avatar file. Resolves the filename
// explicitly against AVATAR_DIR so a tampered DB value can't escape the folder.
export function removeAvatarFile(avatarUrl) {
  if (!avatarUrl) return;
  const filePath = path.join(AVATAR_DIR, path.basename(avatarUrl));
  if (path.dirname(filePath) !== AVATAR_DIR) return;
  fs.promises.unlink(filePath).catch(() => {});
}
