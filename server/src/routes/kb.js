import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, slug, category, updated_at FROM kb_articles WHERE published = 1 ORDER BY updated_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, slug, category, body, updated_at FROM kb_articles WHERE slug = ? AND published = 1 LIMIT 1',
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Article not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
