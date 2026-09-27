const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const checkAdmin = (req, res, next) => {
  const password = req.headers['x-admin-password'];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Invalid admin password' });
  }
  next();
};

// Public: Get notes by chapter
router.get('/chapter/:chapterId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content, type, image_url, created_at FROM notes WHERE chapter_id = $1 ORDER BY id',
      [req.params.chapterId]
    );
    res.json({ success: true, notes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Add note
router.post('/', checkAdmin, async (req, res) => {
  try {
    const { chapter_id, title, content, type, image_url } = req.body;
    const result = await pool.query(
      'INSERT INTO notes (chapter_id, title, content, type, image_url) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [chapter_id, title, content, type || 'short', image_url || null]
    );
    res.json({ success: true, note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: List all notes
router.get('/', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT n.id, n.title, n.type, n.image_url, c.name as chapter_name
      FROM notes n
      LEFT JOIN chapters c ON n.chapter_id = c.id
      ORDER BY n.id DESC LIMIT 50
    `);
    res.json({ success: true, notes: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Delete note
router.delete('/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
