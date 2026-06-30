const express = require('express');
const { authenticate } = require('../middleware/auth');
const { readJSON, writeJSON } = require('../utils/db');

const router = express.Router();

// Package thresholds (100‑499 Bronze, 500‑999 Silver, 1000‑4999 Platinum, 5000+ Leader)
function getPackageInfo(totalDeposited) {
  if (totalDeposited >= 5000) return { pkg: 'Leader',   roi: 30 };
  if (totalDeposited >= 1000) return { pkg: 'Platinum', roi: 30 };
  if (totalDeposited >= 500)  return { pkg: 'Silver',   roi: 15 };
  if (totalDeposited >= 100)  return { pkg: 'Bronze',   roi: 10 };
  return { pkg: 'None', roi: 0 };
}

// Package bonus percentages (used for referral commissions)
const packageBonuses = {
  None:     { direct: 0,  l2: 0,   l3: 0,   l4: 0 },
  Bronze:   { direct: 10, l2: 5,   l3: 0,   l4: 0 },
  Silver:   { direct: 15, l2: 5,   l3: 2.5, l4: 0 },
  Platinum: { direct: 30, l2: 5,   l3: 2.5, l4: 1.75 },
  Leader:   { direct: 30, l2: 5,   l3: 2.5, l4: 1.75 },
};

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
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

  // Update package based on total deposited (never downgrades)
  const { pkg, roi } = getPackageInfo(user.deposited);
  user.pkg = pkg;
  user.roi = roi;
  writeJSON('users.json', users);

  // Real team counts
  const direct = users.filter(u => u.referredBy === req.userId);
  const l1Ids = direct.map(u => u.id);
  const l2 = users.filter(u => l1Ids.includes(u.referredBy));
  const l2Ids = l2.map(u => u.id);
  const l3 = users.filter(u => l2Ids.includes(u.referredBy));
  const totalNetwork = direct.length + l2.length + l3.length;

  // Next payout date (30 days after last payout or signup)
  const lastPayout = user.lastPayout ? new Date(user.lastPayout) : new Date(user.createdAt);
  const nextPayout = new Date(lastPayout);
  nextPayout.setDate(nextPayout.getDate() + 30);
  const daysToPayout = Math.ceil((nextPayout - new Date()) / (1000 * 60 * 60 * 24));

  // Payout amount = current balance × ROI%
  const payoutAmount = user.balance > 0 ? (user.balance * (roi / 100)).toFixed(2) : '0.00';

  // Package list matching the new tiers
  const packages = [
    { tier: 'Bronze',   roi: 10, price: 100,  comm: 10, active: pkg === 'Bronze' },
    { tier: 'Silver',   roi: 15, price: 500,  comm: 15, active: pkg === 'Silver' },
    { tier: 'Platinum', roi: 30, price: 1000, comm: 30, active: pkg === 'Platinum' },
    { tier: 'Leader',   roi: 30, price: 5000, comm: 30, active: pkg === 'Leader' },
  ];

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
    packages,
  });
});

// ─── TEAM ─────────────────────────────────────────────────
router.get('/team', authenticate, (req, res) => {
  const users = readJSON('users.json');
  const currentUser = users.find(u => u.id === req.userId);
  if (!currentUser) return res.status(404).json({ message: 'User not found' });

  // Only users with an active package can see team (frontend locks, but we also enforce here)
  if (currentUser.deposited < 100) {
    return res.status(403).json({ message: 'Team is locked until you activate a package.' });
  }

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

  // Total referral income = sum of commissions from direct referrals
  const l1List = mapMembers(l1, 'direct');
  const totalReferralIncome = l1List.reduce((sum, m) => sum + parseFloat(m.commission), 0);

  res.json({
    direct: { count: l1.length, members: l1List.slice(0, 3) },
    l2:     { count: l2.length, members: mapMembers(l2, 'l2').slice(0, 2) },
    l3:     { count: l3.length, members: mapMembers(l3, 'l3').slice(0, 2) },
    totalReferralIncome,
  });
});

// ─── ADMIN: Platform statistics ──────────────────────────
router.get('/admin/stats', (req, res) => {
  const users = readJSON('users.json');
  const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
  const totalDeposited = users.reduce((sum, u) => sum + (u.deposited || 0), 0);
  const totalUsers = users.length;
  res.json({ totalBalance, totalDeposited, totalUsers });
});

// ─── ADMIN: Get all users ────────────────────────────────
router.get('/admin/users', (req, res) => {
  const users = readJSON('users.json');
  const safeUsers = users.map(({ password, ...rest }) => rest);
  res.json(safeUsers);
});

// ─── ADMIN: Block / Unblock a user ─────────────────────────
router.put('/admin/block/:id', (req, res) => {
  const users = readJSON('users.json');
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ message: 'User not found' });

  users[userIndex].blocked = !users[userIndex].blocked;   // toggle
  writeJSON('users.json', users);
  res.json({ message: users[userIndex].blocked ? 'User blocked' : 'User unblocked', user: users[userIndex] });
});

// ─── ADMIN: Delete a user ──────────────────────────────
router.delete('/admin/delete/:id', (req, res) => {
  const users = readJSON('users.json');
  const filtered = users.filter(u => u.id !== req.params.id);
  if (filtered.length === users.length) return res.status(404).json({ message: 'User not found' });

  writeJSON('users.json', filtered);
  // Optionally delete their transactions, withdrawals, etc. (for simplicity, leave them)
  res.json({ message: 'User deleted' });
});

module.exports = router;