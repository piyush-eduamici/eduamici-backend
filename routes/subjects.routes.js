const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.get('/class/:classId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM subjects WHERE class_id = $1 ORDER BY id',
      [req.params.classId]
    );
    res.json({ success: true, subjects: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
