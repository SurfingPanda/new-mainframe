// Baseline security headers for every response. The SPA itself is served by Vite
// / a static host (not this API), so its own CSP must be set there too — these
// headers harden the API + /uploads responses (defense in depth).
export function securityHeaders(req, res, next) {
  // Never let a browser MIME-sniff a response into something executable.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Don't allow the API/uploads to be framed (clickjacking).
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // API returns JSON and /uploads returns files as attachments — neither needs to
  // load any resources, so a strict policy is safe and blocks injected content.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  // HSTS only over HTTPS (and only in production, so it can't pin localhost to
  // HTTPS during local dev).
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}
