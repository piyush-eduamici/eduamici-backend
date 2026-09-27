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

// Public: Get lectures by chapter
router.get('/chapter/:chapterId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lectures WHERE chapter_id = $1 ORDER BY order_num, id',
      [req.params.chapterId]
    );
    res.json({ success: true, lectures: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Add lecture
router.post('/', checkAdmin, async (req, res) => {
  try {
    const { chapter_id, title, teacher, duration, description, video_url, youtube_id, thumbnail_url, order_num } = req.body;
    const result = await pool.query(
      `INSERT INTO lectures (chapter_id, title, teacher, duration, description, video_url, youtube_id, thumbnail_url, order_num) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [chapter_id, title, teacher, duration, description, video_url, youtube_id || null, thumbnail_url || null, order_num || 1]
    );
    res.json({ success: true, lecture: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: List all lectures
router.get('/', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.id, l.title, l.teacher, l.duration, c.name as chapter_name
      FROM lectures l
      LEFT JOIN chapters c ON l.chapter_id = c.id
      ORDER BY l.id DESC LIMIT 50
    `);
    res.json({ success: true, lectures: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Delete lecture
router.delete('/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM lectures WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
