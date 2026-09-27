const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.get('/', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, username, class_level, xp, level 
      FROM users 
      ORDER BY xp DESC, id ASC 
      LIMIT 50
    `);
    res.json({ success: true, leaderboard: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
