import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported image type: ${file.mimetype}. Use PNG, JPEG, WebP, or GIF.`));
    }
    cb(null, true);
  },
});

const SYSTEM_PROMPT =
  'You are a precise data-extraction tool. You read charts from images and emit ONLY valid JSON. ' +
  'Never include prose, markdown fences, or explanations.';

const USER_PROMPT = `The attached image is a network traffic chart showing internet or network throughput over time.

Extract the visible data points and reply with ONLY a JSON object using this exact shape:

{ "samples": [ { "time": "HH:MM", "downloadMbps": number, "uploadMbps": number } ] }

Rules:
- "time" is the x-axis label as it appears on the chart (e.g. "08:00", "12:00", "8 AM"). Preserve the chart's format.
- "downloadMbps" is the download line's value at that time, in Mbps.
- "uploadMbps" is the upload line's value at that time, in Mbps.
- If the y-axis is in kbps, convert to Mbps (divide by 1000).
- If only one line is present, set the missing value to 0.
- If the chart has clear marker dots, return those exact points. Otherwise sample 6-12 evenly spaced points across the visible time range.
- Round numeric values to 1 decimal place.
- If the image is not a network/throughput chart, return { "samples": [] }.

Output ONLY the JSON object.`;

router.post('/extract-chart', requireAuth, requireRole('admin', 'agent'), (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image provided. Upload as multipart field "image".' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'Image extraction is not configured. Set ANTHROPIC_API_KEY in server/.env to enable.',
      });
    }

    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

    try {
      const base64 = req.file.buffer.toString('base64');

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: req.file.mimetype, data: base64 },
                },
                { type: 'text', text: USER_PROMPT },
              ],
            },
          ],
        }),
      });

      if (!apiRes.ok) {
        const text = await apiRes.text();
        console.error('Anthropic API error:', apiRes.status, text.slice(0, 500));
        return res.status(502).json({
          error: `Vision API error (${apiRes.status})`,
          detail: text.slice(0, 200),
        });
      }

      const data = await apiRes.json();
      const text = data?.content?.[0]?.text || '';

      const samples = parseSamples(text);
      if (!samples) {
        return res.status(422).json({
          error: 'Could not parse chart data from the model response.',
          raw: text.slice(0, 500),
        });
      }

      if (samples.length === 0) {
        return res.status(422).json({
          error: 'No data points were detected in this image. Try a clearer chart screenshot.',
        });
      }

      res.json({ samples, model });
    } catch (e) {
      console.error('extract-chart failed:', e);
      res.status(500).json({ error: e.message || 'Extraction failed' });
    }
  });
});

function tryParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function parseSamples(text) {
  if (!text) return null;
  const trimmed = text.trim();

  let json = tryParse(trimmed);
  if (!json) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) json = tryParse(match[0]);
  }
  if (!json || !Array.isArray(json.samples)) return null;

  return json.samples
    .filter((s) => s && (s.time || s.label))
    .map((s) => ({
      time: String(s.time || s.label || '').slice(0, 16),
      downloadMbps: Math.max(0, Math.round((Number(s.downloadMbps) || 0) * 10) / 10),
      uploadMbps: Math.max(0, Math.round((Number(s.uploadMbps) || 0) * 10) / 10),
    }))
    .slice(0, 50);
}

export default router;
