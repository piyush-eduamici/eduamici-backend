const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ACHIEVEMENTS = [
  { code: 'welcome', icon: '👋', name: 'Welcome', desc: 'Joined StudyHub' },
  { code: 'first_quiz', icon: '🎯', name: 'First Quiz', desc: 'Completed first quiz' },
  { code: 'first_quiz_win', icon: '🏆', name: 'Quiz Champion', desc: 'Won a quiz battle' },
  { code: 'first_friend', icon: '👥', name: 'Social', desc: 'Made first friend' },
  { code: 'first_test', icon: '📝', name: 'Test Taker', desc: 'Completed a mock test' },
  { code: 'level_5', icon: '⭐', name: 'Rising Star', desc: 'Reached Level 5' },
  { code: 'level_10', icon: '🌟', name: 'Star Student', desc: 'Reached Level 10' },
  { code: 'xp_1000', icon: '⚡', name: '1000 XP', desc: 'Earned 1000 XP' },
  { code: 'xp_5000', icon: '💫', name: '5000 XP', desc: 'Earned 5000 XP' },
  { code: 'streak_7', icon: '🔥', name: '7-Day Streak', desc: 'Studied 7 days in a row' },
];

router.get('/user/:userId', async (req, res) => {
  try {
    const unlockedR = await pool.query('SELECT code, unlocked_at FROM user_achievements WHERE user_id = $1', [req.params.userId]);
    const unlocked = unlockedR.rows.map(r => r.code);
    const list = ACHIEVEMENTS.map(a => ({ ...a, unlocked: unlocked.includes(a.code) }));
    res.json({ success: true, achievements: list, unlockedCount: unlocked.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/unlock', async (req, res) => {
  try {
    const { user_id, code } = req.body;
    await pool.query("INSERT INTO user_achievements (user_id, code) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user_id, code]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
