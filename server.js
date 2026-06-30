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
const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Admin routes (protected)
app.use('/api/transactions/admin', adminAuth, transactionRoutes);
app.use('/api/withdrawals/admin', adminAuth, withdrawalRoutes);
app.use('/api/notifications/send', adminAuth, notificationRoutes);   // if send is admin only
app.use('/api/reports/list', adminAuth, reportRoutes);               // protect report listing
app.use('/api/reports/status/:id', adminAuth, reportRoutes);
// Also protect the user admin routes if you have them
app.use('/api/user/admin', adminAuth, userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});