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

// ========== BULK CHAPTERS ==========
// Body: { subject_id, chapters: ["Chapter 1 name", "Chapter 2 name", ...] }
router.post('/chapters', checkAdmin, async (req, res) => {
  try {
    const { subject_id, chapters } = req.body;
    if (!subject_id) return res.status(400).json({ success: false, message: 'Subject required' });
    if (!Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({ success: false, message: 'Chapters array required' });
    }

    // Find current max chapter number for this subject
    const maxR = await pool.query('SELECT COALESCE(MAX(number), 0) as max_num FROM chapters WHERE subject_id = $1', [subject_id]);
    let nextNum = parseInt(maxR.rows[0].max_num) + 1;

    let success = 0, failed = 0;
    const errors = [];

    for (const name of chapters) {
      const trimmed = (name || '').trim();
      if (!trimmed) continue;

      try {
        await pool.query(
          'INSERT INTO chapters (subject_id, number, name, lectures_count, questions_count) VALUES ($1, $2, $3, $4, $5)',
          [subject_id, nextNum, trimmed, 0, 0]
        );
        success++;
        nextNum++;
      } catch (e) {
        failed++;
        errors.push({ name: trimmed, err: e.message });
      }
    }

    res.json({
      success: true,
      total: chapters.length,
      added: success,
      failed,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ========== BULK QUESTIONS ==========
// Body: { chapter_id, questions: [{ question_text, option_a, ..., correct_option, explanation, difficulty }] }
router.post('/questions', checkAdmin, async (req, res) => {
  try {
    const { chapter_id, questions } = req.body;
    if (!chapter_id) return res.status(400).json({ success: false, message: 'Chapter required' });
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Questions array required' });
    }

    let success = 0, failed = 0;
    const errors = [];

    for (const q of questions) {
      try {
        await pool.query(
          `INSERT INTO questions 
           (chapter_id, level, category, question_type, question_text, 
            option_a, option_b, option_c, option_d, correct_option, 
            answer_text, explanation, difficulty, marks) 
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            chapter_id,
            q.level || 1,
            q.category || 'easy_objective',
            q.question_type || 'mcq',
            q.question_text,
            q.option_a || null,
            q.option_b || null,
            q.option_c || null,
            q.option_d || null,
            q.correct_option || null,
            q.answer_text || null,
            q.explanation || null,
            q.difficulty || 'Easy',
            q.marks || 1,
          ]
        );
        success++;
      } catch (e) {
        failed++;
        errors.push({ q: (q.question_text || '').slice(0, 30), err: e.message });
      }
    }

    // Update chapter's question count
    try {
      await pool.query(
        'UPDATE chapters SET questions_count = (SELECT COUNT(*) FROM questions WHERE chapter_id = $1) WHERE id = $1',
        [chapter_id]
      );
    } catch (e) {}

    res.json({
      success: true,
      total: questions.length,
      added: success,
      failed,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ========== GET: Subjects with chapters list ==========
router.get('/subjects-chapters', checkAdmin, async (req, res) => {
  try {
    const subjectsR = await pool.query(`
      SELECT s.id, s.name as subject_name, s.class_id, c.name as class_name
      FROM subjects s
      JOIN classes c ON s.class_id = c.id
      ORDER BY c.id, s.id
    `);

    const subjects = [];
    for (const s of subjectsR.rows) {
      const chaptersR = await pool.query(
        'SELECT id, number, name FROM chapters WHERE subject_id = $1 ORDER BY number',
        [s.id]
      );
      subjects.push({ ...s, chapters: chaptersR.rows });
    }

    res.json({ success: true, subjects });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
