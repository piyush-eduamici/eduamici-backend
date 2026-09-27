const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.get('/subject/:subjectId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chapters WHERE subject_id = $1 ORDER BY number',
      [req.params.subjectId]
    );
    res.json({ success: true, chapters: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
