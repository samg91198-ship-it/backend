const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const withdrawalRoutes = require('./routes/withdrawalRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminAuth = require('./middleware/adminAuth');

const app = express();
const PORT = 8080;                      // Railway will forward to this port automatically

// Middleware
app.use(cors());
app.use(express.json());

// ✅ PUBLIC ROUTES (no admin protection)
app.use('/api/auth', authRoutes);             // signup / login / admin-login
app.use('/api/user', userRoutes);             // profile, dashboard, team, leaderboard, etc.
app.use('/api/transactions', transactionRoutes); // history, deposit (non‑admin parts)
app.use('/api/withdrawals', withdrawalRoutes);   // withdraw (non‑admin parts)
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes); // user‑facing notifications
app.use('/api/reports', reportRoutes);         // submit report, etc.

// ✅ ADMIN‑PROTECTED ROUTES – override specific paths with adminAuth
// (We keep them after the public ones so the admin middleware only applies here)
app.use('/api/transactions/admin', adminAuth, transactionRoutes);
app.use('/api/withdrawals/admin', adminAuth, withdrawalRoutes);
app.use('/api/notifications/send', adminAuth, notificationRoutes);
app.use('/api/reports/list', adminAuth, reportRoutes);
app.use('/api/reports/status/:id', adminAuth, reportRoutes);
app.use('/api/user/admin', adminAuth, userRoutes);

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});