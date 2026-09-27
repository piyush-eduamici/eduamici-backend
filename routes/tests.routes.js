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

// Public: List all tests
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT t.*, cl.name as class_name, s.name as subject_name
      FROM tests t
      LEFT JOIN classes cl ON t.class_id = cl.id
      LEFT JOIN subjects s ON t.subject_id = s.id
      WHERE t.is_active = true
      ORDER BY t.id DESC
    `);
    res.json({ success: true, tests: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Public: Get test with questions (without answers)
router.get('/:id', async (req, res) => {
  try {
    const test = await pool.query('SELECT * FROM tests WHERE id = $1', [req.params.id]);
    if (test.rows.length === 0) return res.status(404).json({ success: false, message: 'Test not found' });

    const questions = await pool.query(`
      SELECT q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, 
             q.question_type, q.marks, q.level, q.category,
             tq.order_num
      FROM test_questions tq
      JOIN questions q ON tq.question_id = q.id
      WHERE tq.test_id = $1
      ORDER BY tq.order_num
    `, [req.params.id]);

    res.json({ success: true, test: test.rows[0], questions: questions.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Admin: Create test
router.post('/', checkAdmin, async (req, res) => {
  try {
    const { title, description, board_id, class_id, subject_id, duration_minutes, question_ids } = req.body;
    
    const testR = await pool.query(
      'INSERT INTO tests (title, description, board_id, class_id, subject_id, duration_minutes, total_questions) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title, description, board_id, class_id, subject_id, duration_minutes || 180, question_ids.length]
    );
    const test = testR.rows[0];

    let order = 1;
    let totalMarks = 0;
    for (const qid of question_ids) {
      const qr = await pool.query('SELECT marks FROM questions WHERE id = $1', [qid]);
      const marks = qr.rows[0]?.marks || 1;
      totalMarks += marks;
      await pool.query('INSERT INTO test_questions (test_id, question_id, order_num, marks) VALUES ($1,$2,$3,$4)', [test.id, qid, order, marks]);
      order++;
    }

    await pool.query('UPDATE tests SET total_marks = $1 WHERE id = $2', [totalMarks, test.id]);

    res.json({ success: true, test: { ...test, total_marks: totalMarks } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Admin: Delete test
router.delete('/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM tests WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Submit test answers
router.post('/:id/submit', async (req, res) => {
  try {
    const { user_id, answers } = req.body;
    const testId = req.params.id;

    const questions = await pool.query(`
      SELECT q.id, q.correct_option, q.marks
      FROM test_questions tq
      JOIN questions q ON tq.question_id = q.id
      WHERE tq.test_id = $1
    `, [testId]);

    let score = 0;
    let total = 0;
    for (const q of questions.rows) {
      total += q.marks;
      if (answers[q.id] === q.correct_option) score += q.marks;
    }

    await pool.query(
      'INSERT INTO test_attempts (test_id, user_id, score, total_marks, answers, completed_at) VALUES ($1,$2,$3,$4,$5,NOW())',
      [testId, user_id, score, total, JSON.stringify(answers)]
    );

    res.json({ success: true, score, total, percentage: Math.round((score/total)*100) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
