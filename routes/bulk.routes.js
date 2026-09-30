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

router.post('/questions', checkAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Questions array required' });
    }
    let success = 0, failed = 0;
    const errors = [];
    for (const q of questions) {
      try {
        await pool.query(
          'INSERT INTO questions (chapter_id, level, category, question_type, question_text, option_a, option_b, option_c, option_d, correct_option, answer_text, explanation, difficulty, marks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
          [q.chapter_id, q.level || 1, q.category || 'easy_objective', q.question_type || 'mcq', q.question_text, q.option_a || null, q.option_b || null, q.option_c || null, q.option_d || null, q.correct_option || null, q.answer_text || null, q.explanation || null, q.difficulty || 'Easy', q.marks || 1]
        );
        success++;
      } catch (e) {
        failed++;
        errors.push({ q: q.question_text?.slice(0, 30), err: e.message });
      }
    }
    res.json({ success: true, total: questions.length, success_count: success, failed, errors: errors.slice(0, 10) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
