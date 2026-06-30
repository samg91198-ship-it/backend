const express = require('express');
const { authenticate } = require('../middleware/auth');
const { readJSON, writeJSON } = require('../utils/db');

const router = express.Router();

// Helper – same as in userRoutes (copied for simplicity)
function getPackageInfo(totalDeposited) {
  if (totalDeposited >= 5000) return { pkg: 'Leader',   roi: 30 };
  if (totalDeposited >= 1000) return { pkg: 'Platinum', roi: 30 };
  if (totalDeposited >= 500)  return { pkg: 'Silver',   roi: 15 };
  if (totalDeposited >= 100)  return { pkg: 'Bronze',   roi: 10 };
  return { pkg: 'None', roi: 0 };
}

const ADMIN_WALLET = process.env.ADMIN_WALLET || 'TXyz123456789AdminWalletAddress';

// ─── HISTORY ──────────────────────────────────────────────
router.get('/history', authenticate, (req, res) => {
  const transactions = readJSON('transactions.json')
    .filter(tx => tx.userId === req.userId)
    .map(tx => ({
      type: tx.type,
      label: tx.label,
      date: tx.date,
      sub: tx.sub,
      amount: tx.amount,
    }));

  const withdrawals = readJSON('withdrawals.json')
    .filter(w => w.userId === req.userId)
    .map(w => ({
      type: 'out',
      label: `Withdrawal ${w.status === 'pending' ? '(pending)' : w.status === 'approved' ? '(approved)' : '(rejected)'}`,
      date: w.createdAt.split('T')[0],
      sub: `To: ${w.address.slice(0, 8)}...`,
      amount: -w.amount,
    }));

  const allItems = [...transactions, ...withdrawals];
  allItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  const grouped = {};
  allItems.forEach(item => {
    const month = item.date.slice(0, 7);
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(item);
  });

  const result = {};
  Object.entries(grouped).forEach(([month, items]) => {
    const d = new Date(month + '-01');
    const monthName = d.toLocaleDateString('en-US', { month:'long', year:'numeric' });
    result[monthName] = items;
  });

  res.json(result);
});

// ─── DEPOSIT REQUEST ──────────────────────────────────────
router.post('/deposit', authenticate, (req, res) => {
  const { amount, transactionHash } = req.body;

  if (!amount || !transactionHash) {
    return res.status(400).json({ message: 'Amount and transaction hash are required' });
  }
  if (amount < 100) {
    return res.status(400).json({ message: 'Minimum deposit is $100' });
  }

  const transactions = readJSON('transactions.json');
  const users = readJSON('users.json');
  const userIndex = users.findIndex(u => u.id === req.userId);
  if (userIndex === -1) return res.status(404).json({ message: 'User not found' });

  const deposit = {
    id: Date.now().toString(),
    userId: req.userId,
    type: 'deposit',
    label: `Deposit request — $${amount}`,
    date: new Date().toISOString().split('T')[0],
    sub: 'USDT TRC20',
    amount: Number(amount),
    transactionHash,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  transactions.push(deposit);
  writeJSON('transactions.json', transactions);

  res.json({ message: 'Deposit request submitted. Awaiting admin approval.', deposit });
});

// ─── ADMIN: Get pending deposits ─────────────────────────
router.get('/admin/pending', (req, res) => {
  const transactions = readJSON('transactions.json');
  const pending = transactions.filter(tx => tx.type === 'deposit' && tx.status === 'pending');
  res.json(pending);
});

// ─── ADMIN: Get ALL deposits ─────────────────────────────
router.get('/admin/all', (req, res) => {
  const transactions = readJSON('transactions.json');
  const allDeposits = transactions.filter(tx => tx.type === 'deposit');
  res.json(allDeposits);
});

// ─── ADMIN: Approve a deposit ────────────────────────────
router.post('/admin/approve/:id', (req, res) => {
  const { id } = req.params;
  const transactions = readJSON('transactions.json');
  const txIndex = transactions.findIndex(tx => tx.id === id);
  if (txIndex === -1) return res.status(404).json({ message: 'Transaction not found' });

  if (transactions[txIndex].type !== 'deposit' || transactions[txIndex].status !== 'pending') {
    return res.status(400).json({ message: 'Transaction cannot be approved' });
  }

  transactions[txIndex].status = 'approved';
  transactions[txIndex].label = `Deposit approved — $${transactions[txIndex].amount}`;

  const users = readJSON('users.json');
  const userIndex = users.findIndex(u => u.id === transactions[txIndex].userId);
  if (userIndex !== -1) {
    users[userIndex].balance += transactions[txIndex].amount;
    users[userIndex].deposited += transactions[txIndex].amount;

    // Apply new package thresholds
    const { pkg, roi } = getPackageInfo(users[userIndex].deposited);
    users[userIndex].pkg = pkg;
    users[userIndex].roi = roi;

    writeJSON('users.json', users);
  }

  writeJSON('transactions.json', transactions);
  res.json({ message: 'Deposit approved', transaction: transactions[txIndex] });
});

// ─── ADMIN: Reject a deposit ─────────────────────────────
router.post('/admin/reject/:id', (req, res) => {
  const { id } = req.params;
  const transactions = readJSON('transactions.json');
  const txIndex = transactions.findIndex(tx => tx.id === id);
  if (txIndex === -1) return res.status(404).json({ message: 'Transaction not found' });

  if (transactions[txIndex].type !== 'deposit' || transactions[txIndex].status !== 'pending') {
    return res.status(400).json({ message: 'Deposit is not pending' });
  }

  transactions[txIndex].status = 'rejected';
  transactions[txIndex].label = `Deposit rejected — $${transactions[txIndex].amount}`;
  writeJSON('transactions.json', transactions);

  res.json({ message: 'Deposit rejected', transaction: transactions[txIndex] });
});

module.exports = router;