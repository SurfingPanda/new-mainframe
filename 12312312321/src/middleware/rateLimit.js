// Minimal in-memory fixed-window rate limiter. The app runs as a single
// process, so a process-local Map is enough — no external dependency needed.
// Each key (typically the client IP) gets `max` requests per `windowMs`.
//
// Note: if the API is ever deployed behind a reverse proxy, set
// `app.set('trust proxy', ...)` in index.js so `req.ip` is the real client IP.

// `keyGenerator(req)` lets a caller bucket by something other than the client IP
// (e.g. the submitted email or the authenticated user id). Returning null/undefined
// from it skips throttling for that request — useful when there's nothing to key on
// yet (the route handler then validates, e.g. a missing email returns 400).
export function rateLimit({ windowMs, max, message = 'Too many requests, please try again later.', keyGenerator }) {
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

    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.socket?.remoteAddress || 'unknown';
    if (key == null) return next(); // nothing to key on — let the handler validate

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

// Convenience: throttle write/mutation endpoints per authenticated user (falls
// back to the IP if somehow unauthenticated). Generous by default so normal use
// never trips it, but enough to blunt scripted spam and disk-fill via repeated
// creates/uploads. Mount it AFTER requireAuth so req.user is populated.
export function userWriteLimit({ windowMs = 60_000, max = 30, message } = {}) {
  return rateLimit({
    windowMs,
    max,
    message: message || 'You are doing that too quickly. Please slow down and try again in a moment.',
    keyGenerator: (req) => (req.user?.sub ? `uw:${req.user.sub}` : req.ip || req.socket?.remoteAddress || 'unknown')
  });
}
