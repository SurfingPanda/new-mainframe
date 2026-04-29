import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, asset_tag, type, model, assignee, location, status FROM assets ORDER BY asset_tag ASC LIMIT 200'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { asset_tag, type, model, assignee, location, status = 'in_use' } = req.body || {};
    if (!asset_tag || !type) {
      return res.status(400).json({ error: 'asset_tag and type are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO assets (asset_tag, type, model, assignee, location, status) VALUES (?, ?, ?, ?, ?, ?)',
      [asset_tag, type, model || null, assignee || null, location || null, status]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

export default router;
