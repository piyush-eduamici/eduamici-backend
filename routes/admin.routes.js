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

router.post('/verify', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Wrong password' });
  }
});

router.get('/chapters', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name as chapter_name, c.number,
             s.name as subject_name, s.id as subject_id,
             cl.name as class_name, cl.id as class_id
      FROM chapters c
      JOIN subjects s ON c.subject_id = s.id
      JOIN classes cl ON s.class_id = cl.id
      ORDER BY cl.id, s.id, c.number
    `);
    res.json({ success: true, chapters: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/questions', checkAdmin, async (req, res) => {
  try {
    const {
      chapter_id, level, category, question_type,
      question_text, option_a, option_b, option_c, option_d,
      correct_option, answer_text, case_passage,
      explanation, difficulty, marks
    } = req.body;

    const result = await pool.query(
      `INSERT INTO questions 
        (chapter_id, level, category, question_type, question_text, 
         option_a, option_b, option_c, option_d, correct_option, 
         answer_text, case_passage, explanation, difficulty, marks) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) 
       RETURNING *`,
      [
        chapter_id, level || 1, category || 'easy_objective', question_type || 'mcq',
        question_text,
        option_a || null, option_b || null, option_c || null, option_d || null,
        correct_option || null, answer_text || null, case_passage || null,
        explanation || null, difficulty || 'Easy', marks || 1
      ]
    );
    res.json({ success: true, question: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/questions', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT q.id, q.level, q.category, q.question_type, q.question_text, 
             q.difficulty, q.marks, c.name as chapter_name, c.number as chapter_number
      FROM questions q
      JOIN chapters c ON q.chapter_id = c.id
      ORDER BY q.id DESC LIMIT 100
    `);
    res.json({ success: true, questions: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/questions/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM questions WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
