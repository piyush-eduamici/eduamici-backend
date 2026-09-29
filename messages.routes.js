const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { createNotification } = require('../utils/notify');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ==== ABUSE WORDS LIST ====
const BAD_WORDS = [
  'fuck', 'fuk', 'f*ck', 'fck', 'fucker', 'fucking', 'fuking',
  'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'whore', 'slut',
  'rape', 'raping',
  'chutiya', 'chutiye', 'chutya', 'chutiyaa', 'chutiyapa',
  'gandu', 'gaand', 'gand', 'gandu', 'gaandu',
  'bhosdi', 'bhosdike', 'bhosdiwala', 'bhosdika',
  'madarchod', 'madarchod', 'maderchod', 'madrchod',
  'behenchod', 'bhenchod', 'behenchodd', 'bahanchod',
  'bkl', 'bsdk', 'mc', 'bc',
  'harami', 'haramkhor', 'haramzada', 'haramzaada',
  'kutta', 'kutte', 'kuttya', 'kutti',
  'kamina', 'kamine', 'kaminay',
  'randi', 'rand', 'rundi',
  'lodu', 'loda', 'lode', 'lauda', 'laude', 'lavda', 'lavde',
  'jhatu', 'jhaatu', 'jhaant', 'jhat',
  'suar', 'suarr',
  'pagal', 'paagal',
  'nalayak',
  'saala', 'saali',
  'teri maa', 'teri ma', 'teri behen',
  'maa ki', 'behen ki', 'gaand mara',
  'chod', 'chodu', 'choda',
  'tatti', 'tattii',
  'gadha', 'gadhe',
  'chamar', 'bhangi',
  'nalayak', 'nikamma',
];

function containsAbuse(text) {
  if (!text) return false;
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = lower.split(/\s+/);
  for (const w of words) {
    if (BAD_WORDS.includes(w)) return true;
    // partial match for long abuse words
    for (const bad of BAD_WORDS) {
      if (bad.length >= 5 && w.includes(bad)) return true;
    }
  }
  return false;
}

// ==== BAN CONFIG ====
const BAN_DAYS = 3;

// ===== LIST USERS (for legacy) =====
router.get('/users', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, username, class_level FROM users ORDER BY username LIMIT 100');
    res.json({ success: true, users: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== GET CONVERSATION =====
router.get('/conversation/:userId/:otherId', async (req, res) => {
  try {
    const { userId, otherId } = req.params;
    const r = await pool.query(`
      SELECT * FROM messages 
      WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
        AND is_deleted = false
      ORDER BY created_at ASC LIMIT 200
    `, [userId, otherId]);
    res.json({ success: true, messages: r.rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== SEND MESSAGE =====
router.post('/', async (req, res) => {
  try {
    const { sender_id, receiver_id, content } = req.body;
    if (!sender_id || !receiver_id || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    // Check if sender is banned
    const banCheck = await pool.query(
      'SELECT chat_banned_until, chat_ban_reason FROM users WHERE id = $1',
      [sender_id]
    );
    if (banCheck.rows.length > 0) {
      const banned = banCheck.rows[0].chat_banned_until;
      if (banned && new Date(banned) > new Date()) {
        const daysLeft = Math.ceil((new Date(banned) - new Date()) / (1000 * 60 * 60 * 24));
        return res.status(403).json({
          success: false,
          message: `Tumhara chat ${daysLeft} din ke liye ban hai. Reason: ${banCheck.rows[0].chat_ban_reason || 'Abusive content'}`,
          bannedUntil: banned,
        });
      }
    }

    // Check for abuse
    if (containsAbuse(content)) {
      const banUntil = new Date(Date.now() + BAN_DAYS * 24 * 60 * 60 * 1000);

      await pool.query(
        'UPDATE users SET chat_banned_until = $1, chat_ban_reason = $2 WHERE id = $3',
        [banUntil, 'Abusive language detected', sender_id]
      );

      // Notify user
      await createNotification(
        sender_id,
        `🚫 Chat banned for ${BAN_DAYS} days due to abusive language`,
        'chat_ban',
        '🚫'
      );

      return res.status(403).json({
        success: false,
        message: `Abusive language detected! Chat ${BAN_DAYS} din ke liye band.`,
        bannedUntil: banUntil,
      });
    }

    const r = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *',
      [sender_id, receiver_id, content.trim()]
    );

    // Notification
    const sender = await pool.query('SELECT username FROM users WHERE id = $1', [sender_id]);
    const preview = content.length > 40 ? content.slice(0, 40) + '...' : content;
    await createNotification(receiver_id, `${sender.rows[0]?.username || 'Someone'}: ${preview}`, 'message', '💬');

    res.json({ success: true, message: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== DELETE MESSAGE =====
router.delete('/:messageId', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const msg = await pool.query('SELECT * FROM messages WHERE id = $1', [req.params.messageId]);
    if (msg.rows.length === 0) return res.status(404).json({ success: false, message: 'Message not found' });

    if (msg.rows[0].sender_id !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Only sender can delete' });
    }

    await pool.query('UPDATE messages SET is_deleted = true WHERE id = $1', [req.params.messageId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== CHECK BAN STATUS =====
router.get('/ban-status/:userId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT chat_banned_until, chat_ban_reason FROM users WHERE id = $1',
      [req.params.userId]
    );
    if (r.rows.length === 0) return res.json({ success: true, banned: false });

    const banned = r.rows[0].chat_banned_until;
    if (banned && new Date(banned) > new Date()) {
      return res.json({
        success: true,
        banned: true,
        until: banned,
        reason: r.rows[0].chat_ban_reason,
      });
    }
    res.json({ success: true, banned: false });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== REPORT USER =====
router.post('/report', async (req, res) => {
  try {
    const { reported_user_id, reporter_user_id, message_content, reason } = req.body;
    await pool.query(
      'INSERT INTO chat_reports (reported_user_id, reporter_user_id, message_content, reason) VALUES ($1,$2,$3,$4)',
      [reported_user_id, reporter_user_id, message_content, reason || 'Inappropriate']
    );

    // Auto-ban if 3+ reports
    const count = await pool.query(
      'SELECT COUNT(*) FROM chat_reports WHERE reported_user_id = $1',
      [reported_user_id]
    );
    if (parseInt(count.rows[0].count) >= 3) {
      const banUntil = new Date(Date.now() + BAN_DAYS * 24 * 60 * 60 * 1000);
      await pool.query(
        'UPDATE users SET chat_banned_until = $1, chat_ban_reason = $2 WHERE id = $3',
        [banUntil, 'Multiple user reports', reported_user_id]
      );
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
