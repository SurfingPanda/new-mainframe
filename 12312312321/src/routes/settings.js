import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getSlaDays, saveSlaDays, sanitizeSlaDays, SLA_PRIORITIES } from '../lib/sla-config.js';

const router = Router();

// Current SLA targets (days per priority). Readable by any signed-in user so the
// client can display them; writes are admin-only below.
router.get('/sla', requireAuth, (req, res) => {
  res.json(getSlaDays());
});

// Update SLA targets. Requires every priority to be an integer 1–365.
router.put('/sla', requireAuth, requirePermission('users', 'manage'), async (req, res, next) => {
  try {
    const clean = sanitizeSlaDays(req.body);
    if (SLA_PRIORITIES.some((p) => !(p in clean))) {
      return res.status(400).json({ error: 'Each priority needs a whole number of days between 1 and 365.' });
    }
    const saved = await saveSlaDays(clean, req.user?.sub ?? null);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

export default router;
