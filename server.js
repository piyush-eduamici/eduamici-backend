const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const classesRoutes = require('./routes/classes.routes');
const subjectsRoutes = require('./routes/subjects.routes');
const chaptersRoutes = require('./routes/chapters.routes');
const questionsRoutes = require('./routes/questions.routes');
const notesRoutes = require('./routes/notes.routes');
const lecturesRoutes = require('./routes/lectures.routes');
const contentRoutes = require('./routes/content.routes');
const testsRoutes = require('./routes/tests.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const messagesRoutes = require('./routes/messages.routes');
const friendsRoutes = require('./routes/friends.routes');
const quizRoutes = require('./routes/quiz.routes');
const achievementsRoutes = require('./routes/achievements.routes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.json({ status: 'ok', message: 'EduAmici API running' }));
app.get('/api/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/chapters', chaptersRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/lectures', lecturesRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/achievements', achievementsRoutes);

app.listen(PORT, '0.0.0.0', () => console.log('✅ EduAmici Backend running on port ' + PORT));
