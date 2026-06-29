const express = require('express');
const { authenticate } = require('../middleware/auth');
const { readJSON, writeJSON } = require('../utils/db');

const router = express.Router();

// Package bonuses
const packageBonuses = {
  None:    { direct: 0,  l2: 0,   l3: 0,   l4: 0 },
  Bronze:  { direct: 10, l2: 5,   l3: 0,   l4: 0 },
  Silver:  { direct: 15, l2: 5,   l3: 2.5, l4: 0 },
  Gold:    { direct: 20, l2: 5,   l3: 2.5, l4: 1.75 },
  Platinum:{ direct: 30, l2: 5,   l3: 2.5, l4: 1.75 },
};

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Utility: assign package based on balance
function assignPackage(balance) {
  if (balance >= 5000) return { pkg: 'Platinum', roi: 30 };
  if (balance >= 1000) return { pkg: 'Gold', roi: 20 };
  if (balance >= 500)  return { pkg: 'Silver', roi: 15 };
  if (balance >= 100)  return { pkg: 'Bronze', roi: 10 };
  return { pkg: 'None', roi: 0 };
}

// ─── PROFILE ──────────────────────────────────────────────
router.get('/profile', authenticate, (req, res) => {
  const users = readJSON('users.json');
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  let referredByName = null;
  if (user.referredBy) {
    const referrer = users.find(u => u.id === user.referredBy);
    referredByName = referrer ? referrer.name : 'Unknown';
  }

  const { password, ...userData } = user;
  res.json({ ...userData, referredByName });
});

// ─── LEADERBOARD ──────────────────────────────────────────
router.get('/leaderboard', authenticate, (req, res) => {
  const users = readJSON('users.json');
  const active = users.filter(u => u.deposited > 0);
  const top = active
    .sort((a, b) => b.deposited - a.deposited)
    .slice(0, 10)
    .map(u => ({ name: u.name, initials: getInitials(u.name), deposited: u.deposited }));
  res.json(top);
});

// ─── DASHBOARD ────────────────────────────────────────────
router.get('/dashboard', authenticate, (req, res) => {
  const users = readJSON('users.json');
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  // Package is based on TOTAL DEPOSITED (never downgrades)
  let pkg = 'None';
  let roi = 0;
  if (user.deposited >= 5000) { pkg = 'Platinum'; roi = 30; }
  else if (user.deposited >= 1000) { pkg = 'Gold'; roi = 20; }
  else if (user.deposited >= 500) { pkg = 'Silver'; roi = 15; }
  else if (user.deposited >= 100) { pkg = 'Bronze'; roi = 10; }

  // Update user's package and roi (in case they upgraded)
  user.pkg = pkg;
  user.roi = roi;
  writeJSON('users.json', users);

  // Real team counts (unchanged)
  const direct = users.filter(u => u.referredBy === req.userId);
  const l1Ids = direct.map(u => u.id);
  const l2 = users.filter(u => l1Ids.includes(u.referredBy));
  const l2Ids = l2.map(u => u.id);
  const l3 = users.filter(u => l2Ids.includes(u.referredBy));
  const totalNetwork = direct.length + l2.length + l3.length;

  // Next payout date
  const lastPayout = user.lastPayout ? new Date(user.lastPayout) : new Date(user.createdAt);
  const nextPayout = new Date(lastPayout);
  nextPayout.setDate(nextPayout.getDate() + 30);
  const daysToPayout = Math.ceil((nextPayout - new Date()) / (1000 * 60 * 60 * 24));

  // Payout amount = current balance × ROI%
  const payoutAmount = user.balance > 0 ? (user.balance * (roi / 100)).toFixed(2) : '0.00';

  res.json({
    balance: user.balance,
    deposited: user.deposited,
    package: pkg,
    roi,
    daysToPayout: daysToPayout > 0 ? daysToPayout : 0,
    nextPayoutDate: nextPayout.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }),
    payoutAmount,
    directAffiliates: direct.length,
    totalNetwork,
    packages: [
      { tier: 'Bronze', roi: 10, price: 100, comm: 10, active: pkg === 'Bronze' },
      { tier: 'Silver', roi: 15, price: 500, comm: 15, active: pkg === 'Silver' },
      { tier: 'Gold', roi: 20, price: 1000, comm: 20, active: pkg === 'Gold' },
      { tier: 'Platinum', roi: 30, price: 5000, comm: 30, active: pkg === 'Platinum' },
    ],
  });
});

// ─── TEAM ─────────────────────────────────────────────────
router.get('/team', authenticate, (req, res) => {
  const users = readJSON('users.json');
  const currentUser = users.find(u => u.id === req.userId);
  if (!currentUser) return res.status(404).json({ message: 'User not found' });

  const userPkg = currentUser.pkg || 'None';
  const bonuses = packageBonuses[userPkg];

  const l1 = users.filter(u => u.referredBy === req.userId);
  const l1Ids = l1.map(u => u.id);
  const l2 = users.filter(u => l1Ids.includes(u.referredBy));
  const l2Ids = l2.map(u => u.id);
  const l3 = users.filter(u => l2Ids.includes(u.referredBy));

  const mapMembers = (arr, level) => arr.map(u => ({
    initials: getInitials(u.name),
    name: u.name,
    pkg: u.pkg,
    commission: (u.deposited * (bonuses[level] / 100)).toFixed(2),
  }));

  res.json({
    direct: { count: l1.length, members: mapMembers(l1, 'direct').slice(0, 3) },
    l2:     { count: l2.length, members: mapMembers(l2, 'l2').slice(0, 2) },
    l3:     { count: l3.length, members: mapMembers(l3, 'l3').slice(0, 2) },
  });
});

// ADMIN: Platform statistics
router.get('/admin/stats', (req, res) => {
  const users = readJSON('users.json');
  const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
  const totalDeposited = users.reduce((sum, u) => sum + (u.deposited || 0), 0);
  const totalUsers = users.length;
  res.json({
    totalBalance,
    totalDeposited,
    totalUsers,
  });
});

// ADMIN: Get all users (without passwords)
router.get('/admin/users', (req, res) => {
  const users = readJSON('users.json');
  const safeUsers = users.map(({ password, ...rest }) => rest);
  res.json(safeUsers);
});

module.exports = router;