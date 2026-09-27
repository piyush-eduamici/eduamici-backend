const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { createNotification } = require('../utils/notify');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

router.get('/:userId', async (req, res) => {
  try {
    const uid = req.params.userId;
    const r = await pool.query(`
      SELECT u.id, u.username, u.class_level
      FROM friendships f
      JOIN users u ON (CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END = u.id)
      WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
    `, [uid]);
    res.json({ success: true, friends: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:userId/requests', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT f.id as request_id, u.id, u.username, u.class_level, f.created_at
      FROM friendships f
      JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = $1 AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [req.params.userId]);
    res.json({ success: true, requests: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:userId/sent', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT f.id as request_id, u.id, u.username, u.class_level
      FROM friendships f JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = $1 AND f.status = 'pending'
    `, [req.params.userId]);
    res.json({ success: true, sent: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:userId/search', async (req, res) => {
  try {
    const uid = req.params.userId;
    const q = (req.query.q || '').trim();
    const r = await pool.query(`
      SELECT u.id, u.username, u.class_level FROM users u
      WHERE u.id != $1 AND u.username ILIKE $2
        AND u.id NOT IN (SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status IN ('pending','accepted'))
      ORDER BY u.username LIMIT 20
    `, [uid, '%' + q + '%']);
    res.json({ success: true, users: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/request', async (req, res) => {
  try {
    const { user_id, friend_id } = req.body;
    if (user_id === friend_id) return res.status(400).json({ success: false, message: 'Cannot add yourself' });

    const ex = await pool.query(`
      SELECT id, status FROM friendships
      WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
    `, [user_id, friend_id]);

    if (ex.rows.length > 0) {
      const existing = ex.rows[0];
      if (existing.status === 'accepted') return res.json({ success: false, message: 'Already friends' });
      if (existing.status === 'pending') return res.json({ success: false, message: 'Request already exists' });
    }

    const r = await pool.query('INSERT INTO friendships (user_id, friend_id, status) VALUES ($1,$2,$3) RETURNING *', [user_id, friend_id, 'pending']);

    const sender = await pool.query('SELECT username FROM users WHERE id = $1', [user_id]);
    try { await createNotification(friend_id, `${sender.rows[0]?.username || 'Someone'} sent you a friend request`, 'friend_request', '👥'); } catch(e){}

    res.json({ success: true, friendship: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/accept/:requestId', async (req, res) => {
  try {
    const r = await pool.query("UPDATE friendships SET status = 'accepted' WHERE id = $1 RETURNING *", [req.params.requestId]);
    if (r.rows.length > 0) {
      const f = r.rows[0];
      const accepter = await pool.query('SELECT username FROM users WHERE id = $1', [f.friend_id]);
      try { await createNotification(f.user_id, `${accepter.rows[0]?.username || 'Someone'} accepted your friend request 🎉`, 'friend_accept', '✅'); } catch(e){}
    }
    res.json({ success: true, friendship: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/reject/:requestId', async (req, res) => {
  try {
    await pool.query('DELETE FROM friendships WHERE id = $1', [req.params.requestId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:userId/:friendId', async (req, res) => {
  try {
    const { userId, friendId } = req.params;
    await pool.query(`DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`, [userId, friendId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
