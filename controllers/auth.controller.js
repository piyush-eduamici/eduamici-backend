const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createNotification } = require('../utils/notify');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const register = async (req, res) => {
  try {
    const { username, email, password, class_level } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'All fields required' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, message: 'User already exists' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, class_level) VALUES ($1, $2, $3, $4) RETURNING id, username, email, class_level, role, xp, level, streak',
      [username, email, hash, class_level || 9]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await createNotification(user.id, 'Welcome to EduAmici! Start your learning journey!', 'welcome', '👋');

    res.json({ success: true, token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true, token,
      user: { id: user.id, username: user.username, email: user.email, class_level: user.class_level, role: user.role, xp: user.xp, level: user.level, streak: user.streak }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Forgot Password — Send OTP
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const userR = await pool.query('SELECT id, username FROM users WHERE email = $1', [email]);
    if (userR.rows.length === 0) return res.status(404).json({ success: false, message: 'Email not registered' });

    const user = userR.rows[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await pool.query('UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false', [user.id]);
    await pool.query('INSERT INTO password_resets (user_id, otp, expires_at) VALUES ($1, $2, $3)', [user.id, otp, expiresAt]);

    // In real production, send via email. For now, return in response (with warning).
    res.json({
      success: true,
      message: 'OTP generated. In production, this would be sent to email.',
      otp_demo: otp,
      email: email,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Verify OTP + Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ success: false, message: 'All fields required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password min 6 characters' });

    const userR = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userR.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const userId = userR.rows[0].id;
    const otpR = await pool.query(
      "SELECT id FROM password_resets WHERE user_id = $1 AND otp = $2 AND used = false AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [userId, otp]
    );
    if (otpR.rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [otpR.rows[0].id]);

    res.json({ success: true, message: 'Password reset successful! Please login.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { register, login, forgotPassword, resetPassword };
