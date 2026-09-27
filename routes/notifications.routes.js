const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.get('/user/:userId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
      [req.params.userId]
    );
    res.json({ success: true, notifications: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { user_id, title, type, icon } = req.body;
    const r = await pool.query(
      'INSERT INTO notifications (user_id, title, type, icon) VALUES ($1,$2,$3,$4) RETURNING *',
      [user_id, title, type, icon]
    );
    res.json({ success: true, notification: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
