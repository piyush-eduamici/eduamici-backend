const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function createNotification(userId, title, type, icon) {
  try {
    if (!userId) return;
    await pool.query(
      'INSERT INTO notifications (user_id, title, type, icon) VALUES ($1,$2,$3,$4)',
      [userId, title, type || 'info', icon || '🔔']
    );
  } catch (e) {
    console.error('Notification error:', e.message);
  }
}

module.exports = { createNotification };
