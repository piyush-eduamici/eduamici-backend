const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { createNotification } = require('../utils/notify');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Create room
router.post('/create', async (req, res) => {
  try {
    const { host_id, chapter_id, mode, questions_count, time_per_question } = req.body;
    if (!host_id || !chapter_id) return res.status(400).json({ success: false, message: 'Missing fields' });

    // Check chapter has enough questions
    const qr = await pool.query('SELECT id, correct_option, marks FROM questions WHERE chapter_id = $1 ORDER BY RANDOM() LIMIT $2', [chapter_id, questions_count || 5]);
    if (qr.rows.length < 1) return res.status(400).json({ success: false, message: 'Is chapter mein questions nahi hain' });

    const code = genCode();
    const roomR = await pool.query(
      'INSERT INTO quiz_rooms (code, host_id, chapter_id, mode, questions_count, time_per_question, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [code, host_id, chapter_id, mode || 'solo', qr.rows.length, time_per_question || 30, 'waiting']
    );
    const room = roomR.rows[0];

    // Insert questions
    let order = 1;
    for (const q of qr.rows) {
      await pool.query('INSERT INTO quiz_questions (room_id, question_id, order_num) VALUES ($1,$2,$3)', [room.id, q.id, order]);
      order++;
    }

    // Add host as participant
    await pool.query('INSERT INTO quiz_participants (room_id, user_id, team) VALUES ($1,$2,$3)', [room.id, host_id, 'A']);

    res.json({ success: true, room });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Join room
router.post('/join', async (req, res) => {
  try {
    const { code, user_id, team } = req.body;
    if (!code || !user_id) return res.status(400).json({ success: false, message: 'Missing fields' });

    const roomR = await pool.query('SELECT * FROM quiz_rooms WHERE code = $1', [code.toUpperCase()]);
    if (roomR.rows.length === 0) return res.status(404).json({ success: false, message: 'Room not found' });
    const room = roomR.rows[0];
    if (room.status !== 'waiting') return res.status(400).json({ success: false, message: 'Game already started' });

    await pool.query(
      'INSERT INTO quiz_participants (room_id, user_id, team) VALUES ($1,$2,$3) ON CONFLICT (room_id, user_id) DO NOTHING',
      [room.id, user_id, team || 'B']
    );

    res.json({ success: true, room });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Get room state (for polling)
router.get('/room/:roomId/state', async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const roomR = await pool.query('SELECT * FROM quiz_rooms WHERE id = $1', [roomId]);
    if (roomR.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    const room = roomR.rows[0];

    const partsR = await pool.query(`
      SELECT qp.id, qp.user_id, qp.team, qp.score, u.username
      FROM quiz_participants qp JOIN users u ON qp.user_id = u.id
      WHERE qp.room_id = $1 ORDER BY qp.team, qp.score DESC
    `, [roomId]);

    let currentQ = null;
    let serverTime = new Date().toISOString();
    let timeLeft = 0;
    let questionsTotal = 0;
    let allAnswered = false;

    if (room.status === 'playing') {
      const qR = await pool.query(`
        SELECT qq.order_num, q.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.marks
        FROM quiz_questions qq JOIN questions q ON qq.question_id = q.id
        WHERE qq.room_id = $1 AND qq.order_num = $2
      `, [roomId, room.current_q_index + 1]);

      if (qR.rows.length > 0) currentQ = qR.rows[0];

      const totalR = await pool.query('SELECT COUNT(*) FROM quiz_questions WHERE room_id = $1', [roomId]);
      questionsTotal = parseInt(totalR.rows[0].count);

      if (room.current_q_started_at && currentQ) {
        const startedMs = new Date(room.current_q_started_at).getTime();
        const elapsed = Math.floor((Date.now() - startedMs) / 1000);
        timeLeft = Math.max(0, room.time_per_question - elapsed);
      }

      // Check if everyone answered current question
      if (currentQ) {
        const answeredR = await pool.query(`
          SELECT COUNT(DISTINCT user_id) FROM quiz_answers
          WHERE room_id = $1 AND question_id = $2
        `, [roomId, currentQ.id]);
        const partCount = partsR.rows.length;
        allAnswered = parseInt(answeredR.rows[0].count) >= partCount;
      }
    }

    res.json({
      success: true, room, participants: partsR.rows,
      currentQuestion: currentQ, timeLeft, questionsTotal, allAnswered, serverTime
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Start game (host only)
router.post('/room/:roomId/start', async (req, res) => {
  try {
    const { user_id } = req.body;
    const roomR = await pool.query('SELECT * FROM quiz_rooms WHERE id = $1', [req.params.roomId]);
    const room = roomR.rows[0];
    if (room.host_id !== parseInt(user_id)) return res.status(403).json({ success: false, message: 'Only host can start' });

    await pool.query(
      "UPDATE quiz_rooms SET status = 'playing', current_q_index = 0, current_q_started_at = NOW() WHERE id = $1",
      [room.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Next question (host only)
router.post('/room/:roomId/next', async (req, res) => {
  try {
    const { user_id } = req.body;
    const roomR = await pool.query('SELECT * FROM quiz_rooms WHERE id = $1', [req.params.roomId]);
    const room = roomR.rows[0];
    if (room.host_id !== parseInt(user_id)) return res.status(403).json({ success: false, message: 'Only host' });

    const totalR = await pool.query('SELECT COUNT(*) FROM quiz_questions WHERE room_id = $1', [room.id]);
    const total = parseInt(totalR.rows[0].count);

    if (room.current_q_index + 1 >= total) {
      // Game ended
      await pool.query("UPDATE quiz_rooms SET status = 'finished' WHERE id = $1", [room.id]);

      // Give XP + notification + achievement
      const parts = await pool.query('SELECT * FROM quiz_participants WHERE room_id = $1 ORDER BY score DESC', [room.id]);
      for (const p of parts.rows) {
        const xpGain = p.score * 10;
        if (xpGain > 0) {
          await pool.query('UPDATE users SET xp = xp + $1 WHERE id = $2', [xpGain, p.user_id]);
        }
      }
      const winner = parts.rows[0];
      if (winner) {
        await createNotification(winner.user_id, `🏆 You won the Quiz Battle! +${winner.score * 10} XP`, 'quiz_win', '🏆');
        // Achievement
        try { await pool.query("INSERT INTO user_achievements (user_id, code) VALUES ($1, 'first_quiz_win') ON CONFLICT DO NOTHING", [winner.user_id]); } catch(e){}
      }
      // Everyone gets first quiz achievement
      for (const p of parts.rows) {
        try { await pool.query("INSERT INTO user_achievements (user_id, code) VALUES ($1, 'first_quiz') ON CONFLICT DO NOTHING", [p.user_id]); } catch(e){}
      }
    } else {
      await pool.query(
        "UPDATE quiz_rooms SET current_q_index = current_q_index + 1, current_q_started_at = NOW() WHERE id = $1",
        [room.id]
      );
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Submit answer
router.post('/room/:roomId/answer', async (req, res) => {
  try {
    const { user_id, question_id, selected_option } = req.body;
    const roomId = req.params.roomId;

    const qR = await pool.query('SELECT correct_option, marks FROM questions WHERE id = $1', [question_id]);
    if (qR.rows.length === 0) return res.status(404).json({ success: false, message: 'Question not found' });
    const correct = qR.rows[0].correct_option;
    const marks = qR.rows[0].marks || 1;
    const isCorrect = selected_option === correct;

    await pool.query(`
      INSERT INTO quiz_answers (room_id, user_id, question_id, selected_option, is_correct)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (room_id, user_id, question_id) DO NOTHING
    `, [roomId, user_id, question_id, selected_option, isCorrect]);

    if (isCorrect) {
      await pool.query('UPDATE quiz_participants SET score = score + $1 WHERE room_id = $2 AND user_id = $3', [marks, roomId, user_id]);
    }

    res.json({ success: true, isCorrect, correct_option: correct });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
