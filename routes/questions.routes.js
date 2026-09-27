const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.get('/chapter/:chapterId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty FROM questions WHERE chapter_id = $1 ORDER BY id',
      [req.params.chapterId]
    );
    res.json({ success: true, questions: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
