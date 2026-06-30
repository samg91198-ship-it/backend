const express = require('express');
const { authenticate } = require('../middleware/auth');
const { readJSON, writeJSON } = require('../utils/db');

const router = express.Router();

const WITHDRAWALS_FILE = 'withdrawals.json';
const USERS_FILE = 'users.json';

function getPackageInfo(totalDeposited) {
  if (totalDeposited >= 5000) return { pkg: 'Leader',   roi: 30 };
  if (totalDeposited >= 1000) return { pkg: 'Platinum', roi: 20 };
  if (totalDeposited >= 500)  return { pkg: 'Silver',   roi: 15 };
  if (totalDeposited >= 100)  return { pkg: 'Bronze',   roi: 10 };
  return { pkg: 'None', roi: 0 };
}

function getDirectBonus(pkg) {
  const map = { None: 0, Bronze: 10, Silver: 15, Platinum: 20, Leader: 30 };
  return map[pkg] || 0;
}

// ─── USER: Submit withdrawal request ─────────────────────
router.post('/withdraw', authenticate, (req, res) => {
  const { address, amount } = req.body;

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

  users[userIndex].balance -= numAmount;
  writeJSON(USERS_FILE, users);

  const withdrawals = readJSON(WITHDRAWALS_FILE);
  const newWithdrawal = {
    id: Date.now().toString(),
    userId: req.userId,
    userName: users[userIndex].name,
    userEmail: users[userIndex].email,
    address,
    amount: numAmount,
    status: 'pending',
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

// ─── ADMIN: Get pending withdrawals (userEmail & userName already stored) ─
router.get('/admin/pending', (req, res) => {
  const withdrawals = readJSON(WITHDRAWALS_FILE);
  const pending = withdrawals.filter(w => w.status === 'pending');
  res.json(pending);
});

// ─── ADMIN: Get ALL withdrawals ─────────────────────────
router.get('/admin/all', (req, res) => {
  const withdrawals = readJSON(WITHDRAWALS_FILE);
  res.json(withdrawals);
});

// ─── ADMIN: Approve a withdrawal (with referral commission) ─
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

  const users = readJSON(USERS_FILE);
  const withdrawUser = users.find(u => u.id === withdrawals[index].userId);
  if (withdrawUser && withdrawUser.referredBy) {
    const referrer = users.find(u => u.id === withdrawUser.referredBy);
    if (referrer && referrer.deposited >= 100) {
      const directBonus = getDirectBonus(referrer.pkg);
      if (directBonus > 0) {
        const commission = parseFloat((withdrawals[index].amount * (directBonus / 100)).toFixed(2));
        referrer.balance += commission;

        const transactions = readJSON('transactions.json');
        transactions.push({
          id: Date.now().toString(),
          userId: referrer.id,
          type: 'ref',
          label: `Referral commission — ${withdrawUser.name}`,
          date: new Date().toISOString().split('T')[0],
          sub: 'Withdrawal bonus',
          amount: commission,
        });
        writeJSON('transactions.json', transactions);
        writeJSON(USERS_FILE, users);
      }
    }
  }

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