const express = require('express');
const { authenticate } = require('../middleware/auth');
const { readJSON, writeJSON } = require('../utils/db');
const router = express.Router();

const REPORTS_FILE = 'reports.json';

// User submits a report
router.post('/submit', authenticate, (req, res) => {
  const { subject, description } = req.body;
  if (!subject || !description) {
    return res.status(400).json({ message: 'Subject and description are required' });
  }
  const users = readJSON('users.json');
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const reports = readJSON(REPORTS_FILE);
  const newReport = {
    id: Date.now().toString(),
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    subject,
    description,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  reports.push(newReport);
  writeJSON(REPORTS_FILE, reports);
  res.status(201).json({ message: 'Report submitted', report: newReport });
});

// Admin gets all reports
router.get('/list', (req, res) => {
  const reports = readJSON(REPORTS_FILE);
  res.json(reports);
});

// Admin updates report status
router.put('/status/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'resolved' or 'closed'
  const reports = readJSON(REPORTS_FILE);
  const idx = reports.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Report not found' });
  reports[idx].status = status;
  writeJSON(REPORTS_FILE, reports);
  res.json({ message: 'Report updated', report: reports[idx] });
});

module.exports = router;