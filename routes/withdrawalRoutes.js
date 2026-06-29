const express = require('express');
const { authenticate } = require('../middleware/auth');
const { readJSON, writeJSON } = require('../utils/db');

const router = express.Router();

// File names
const WITHDRAWALS_FILE = 'withdrawals.json';
const USERS_FILE = 'users.json';

// ─── USER: Submit withdrawal request ─────────────────────
router.post('/withdraw', authenticate, (req, res) => {
  const { address, amount } = req.body;

  // Validation
  if (!address || !amount) {
    return res.status(400).json({ message: 'Wallet address and amount are required' });
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 10) {
    return res.status(400).json({ message: 'Minimum withdrawal is $10' });
  }

  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === req.userId);
  if (userIndex === -1) return res.status(404).json({ message: 'User not found' });

  if (users[userIndex].balance < numAmount) {
    return res.status(400).json({ message: 'Insufficient balance' });
  }

  // Deduct balance immediately
  users[userIndex].balance -= numAmount;
  writeJSON(USERS_FILE, users);

  // Create withdrawal record
  const withdrawals = readJSON(WITHDRAWALS_FILE);
  const newWithdrawal = {
    id: Date.now().toString(),
    userId: req.userId,
    userName: users[userIndex].name,
    userEmail: users[userIndex].email,
    address,
    amount: numAmount,
    status: 'pending',   // pending / approved / rejected
    createdAt: new Date().toISOString(),
    processedAt: null,
  };

  withdrawals.push(newWithdrawal);
  writeJSON(WITHDRAWALS_FILE, withdrawals);

  res.json({
    message: 'Withdrawal request submitted. It will be processed within 24 hours.',
    balance: users[userIndex].balance,
  });
});

// ─── ADMIN: Get all pending withdrawals ─────────────────
router.get('/admin/pending', (req, res) => {
  const withdrawals = readJSON(WITHDRAWALS_FILE);
  const pending = withdrawals.filter(w => w.status === 'pending');
  res.json(pending);
});

// ADMIN: Get ALL withdrawals (pending, approved, rejected)
router.get('/admin/all', (req, res) => {
  const withdrawals = readJSON(WITHDRAWALS_FILE);
  res.json(withdrawals);
});

// ─── ADMIN: Approve a withdrawal ─────────────────────────
router.post('/admin/approve/:id', (req, res) => {
  const withdrawals = readJSON(WITHDRAWALS_FILE);
  const index = withdrawals.findIndex(w => w.id === req.params.id);

  if (index === -1) return res.status(404).json({ message: 'Withdrawal not found' });
  if (withdrawals[index].status !== 'pending') {
    return res.status(400).json({ message: 'Withdrawal is not pending' });
  }

  withdrawals[index].status = 'approved';
  withdrawals[index].processedAt = new Date().toISOString();
  writeJSON(WITHDRAWALS_FILE, withdrawals);

  // Balance was already deducted, so no further action needed.
  // (Optionally you can add a transaction record here, but we keep it out of transactions.json)

  res.json({ message: 'Withdrawal approved', withdrawal: withdrawals[index] });
});

// ─── ADMIN: Reject a withdrawal (refund balance) ─────────
router.post('/admin/reject/:id', (req, res) => {
  const withdrawals = readJSON(WITHDRAWALS_FILE);
  const index = withdrawals.findIndex(w => w.id === req.params.id);

  if (index === -1) return res.status(404).json({ message: 'Withdrawal not found' });
  if (withdrawals[index].status !== 'pending') {
    return res.status(400).json({ message: 'Withdrawal is not pending' });
  }

  // Refund the user's balance
  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === withdrawals[index].userId);
  if (userIndex !== -1) {
    users[userIndex].balance += withdrawals[index].amount;
    writeJSON(USERS_FILE, users);
  }

  withdrawals[index].status = 'rejected';
  withdrawals[index].processedAt = new Date().toISOString();
  writeJSON(WITHDRAWALS_FILE, withdrawals);

  res.json({ message: 'Withdrawal rejected and balance refunded', withdrawal: withdrawals[index] });
});

module.exports = router;