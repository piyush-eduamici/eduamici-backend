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

// ===== GET endpoints =====
router.get('/boards', async (req, res) => {
  try { const r = await pool.query('SELECT * FROM boards ORDER BY id'); res.json({ success: true, boards: r.rows }); }
  catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/classes-all', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT cl.*, b.name as board_name
      FROM classes cl LEFT JOIN boards b ON cl.board_id = b.id
      ORDER BY cl.id
    `);
    res.json({ success: true, classes: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/classes-by-board/:boardId', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM classes WHERE board_id = $1 ORDER BY id', [req.params.boardId]);
    res.json({ success: true, classes: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/subjects-all', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT s.*, c.name as class_name
      FROM subjects s LEFT JOIN classes c ON s.class_id = c.id
      ORDER BY s.id
    `);
    res.json({ success: true, subjects: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/subjects-by-class/:classId', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM subjects WHERE class_id = $1 ORDER BY id', [req.params.classId]);
    res.json({ success: true, subjects: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/chapters-all', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT ch.*, s.name as subject_name, cl.name as class_name
      FROM chapters ch
      JOIN subjects s ON ch.subject_id = s.id
      JOIN classes cl ON s.class_id = cl.id
      ORDER BY cl.id, s.id, ch.number
    `);
    res.json({ success: true, chapters: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/chapters-by-subject/:subjectId', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM chapters WHERE subject_id = $1 ORDER BY number', [req.params.subjectId]);
    res.json({ success: true, chapters: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== POST endpoints =====
router.post('/boards', checkAdmin, async (req, res) => {
  try {
    const { name, slug, description } = req.body;
    const r = await pool.query('INSERT INTO boards (name, slug, description) VALUES ($1,$2,$3) RETURNING *', [name, slug, description]);
    res.json({ success: true, board: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/classes', checkAdmin, async (req, res) => {
  try {
    const { board_id, name, tagline, color, emoji } = req.body;
    const r = await pool.query('INSERT INTO classes (board_id, name, tagline, color, emoji) VALUES ($1,$2,$3,$4,$5) RETURNING *', [board_id, name, tagline, color || '#3b82f6', emoji || '📘']);
    res.json({ success: true, class: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/subjects', checkAdmin, async (req, res) => {
  try {
    const { class_id, name, slug, color, emoji } = req.body;
    const r = await pool.query('INSERT INTO subjects (class_id, name, slug, color, emoji) VALUES ($1,$2,$3,$4,$5) RETURNING *', [class_id, name, slug, color || '#3b82f6', emoji || '📚']);
    res.json({ success: true, subject: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/chapters', checkAdmin, async (req, res) => {
  try {
    const { subject_id, number, name, lectures_count, questions_count } = req.body;
    const r = await pool.query('INSERT INTO chapters (subject_id, number, name, lectures_count, questions_count) VALUES ($1,$2,$3,$4,$5) RETURNING *', [subject_id, number, name, lectures_count || 0, questions_count || 0]);
    res.json({ success: true, chapter: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== DELETE endpoints =====
router.delete('/boards/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM boards WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/classes/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM classes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/subjects/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/chapters/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM chapters WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
