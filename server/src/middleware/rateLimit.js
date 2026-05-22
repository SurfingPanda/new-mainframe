// Minimal in-memory fixed-window rate limiter. The app runs as a single
// process, so a process-local Map is enough — no external dependency needed.
// Each key (typically the client IP) gets `max` requests per `windowMs`.
//
// Note: if the API is ever deployed behind a reverse proxy, set
// `app.set('trust proxy', ...)` in index.js so `req.ip` is the real client IP.

export function rateLimit({ windowMs, max, message = 'Too many requests, please try again later.' }) {
  const hits = new Map(); // key -> { count, resetAt }
  let lastSweep = Date.now();

  // Drop expired entries so the Map can't grow without bound.
  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    for (const [key, rec] of hits) {
      if (rec.resetAt <= now) hits.delete(key);
    }
    lastSweep = now;
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    sweep(now);

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count += 1;

    if (rec.count > max) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    next();
  };
}
