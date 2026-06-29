const express = require('express');
const { readJSON, writeJSON } = require('../utils/db');
const router = express.Router();

const NOTIFICATIONS_FILE = 'notifications.json';

// Send notification to all users or a specific user
router.post('/send', (req, res) => {
  const { message, userId } = req.body; // userId optional (null = all)
  if (!message || !message.trim()) {
    return res.status(400).json({ message: 'Notification message is required' });
  }
  const notifications = readJSON(NOTIFICATIONS_FILE);
  const newNotif = {
    id: Date.now().toString(),
    message: message.trim(),
    targetUserId: userId || 'all',
    createdAt: new Date().toISOString(),
    read: false,
  };
  notifications.push(newNotif);
  writeJSON(NOTIFICATIONS_FILE, notifications);
  res.json({ message: 'Notification sent', notification: newNotif });
});

// Get all notifications (admin view)
router.get('/list', (req, res) => {
  const notifications = readJSON(NOTIFICATIONS_FILE);
  res.json(notifications);
});

const { authenticate } = require('../middleware/auth');

// Get notifications for the logged-in user
router.get('/mine', authenticate, (req, res) => {
  const notifications = readJSON('notifications.json');
  // Show notifications targeted to this user OR to 'all'
  const mine = notifications.filter(
    n => n.targetUserId === 'all' || n.targetUserId === req.userId
  );
  // Mark unseen ones as unread (we'll add a read flag later)
  res.json(mine.reverse()); // newest first
});

// Mark a notification as read
router.put('/read/:id', authenticate, (req, res) => {
  const notifications = readJSON('notifications.json');
  const index = notifications.findIndex(n => n.id === req.params.id);
  if (index !== -1) {
    notifications[index].read = true;
    writeJSON('notifications.json', notifications);
  }
  res.json({ ok: true });
});

// Get unread count
router.get('/unread-count', authenticate, (req, res) => {
  const notifications = readJSON('notifications.json');
  const count = notifications.filter(
    n => (n.targetUserId === 'all' || n.targetUserId === req.userId) && !n.read
  ).length;
  res.json({ count });
});

module.exports = router;