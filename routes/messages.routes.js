const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Get all users (to start chat with)
router.get('/users', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, username, class_level FROM users ORDER BY username LIMIT 100'
    );
    res.json({ success: true, users: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get conversation between two users
router.get('/conversation/:userId/:otherId', async (req, res) => {
  try {
    const { userId, otherId } = req.params;
    const r = await pool.query(`
      SELECT * FROM messages 
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC
      LIMIT 200
    `, [userId, otherId]);
    res.json({ success: true, messages: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Send message
router.post('/', async (req, res) => {
  try {
    const { sender_id, receiver_id, content } = req.body;
    if (!sender_id || !receiver_id || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }
    const r = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *',
      [sender_id, receiver_id, content.trim()]
    );
    res.json({ success: true, message: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Recent conversations (unique users you chatted with)
router.get('/conversations/:userId', async (req, res) => {
  try {
    const uid = req.params.userId;
    const r = await pool.query(`
      SELECT DISTINCT ON (other_id)
        other_id, other_username, other_class, content, created_at
      FROM (
        SELECT m.receiver_id AS other_id, u.username AS other_username, u.class_level AS other_class,
               m.content, m.created_at
        FROM messages m JOIN users u ON m.receiver_id = u.id
        WHERE m.sender_id = $1
        UNION ALL
        SELECT m.sender_id AS other_id, u.username AS other_username, u.class_level AS other_class,
               m.content, m.created_at
        FROM messages m JOIN users u ON m.sender_id = u.id
        WHERE m.receiver_id = $1
      ) sub
      ORDER BY other_id, created_at DESC
    `, [uid]);
    res.json({ success: true, conversations: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
