const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { readJSON, writeJSON } = require('../utils/db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const REFERRAL_BASE = process.env.REFERRAL_BASE_URL || 'https://tarde4sure.netlify.app/';

function generateRefCode(users, length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (users.some(u => u.refCode === code));
  return code;
}

router.post('/signup', async (req, res) => {
  const { name, email, password, age, refCode } = req.body;

  if (!name || !email || !password || !age) {
    return res.status(400).json({ message: 'Name, email, password and age are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  const ageNum = Number(age);
  if (isNaN(ageNum) || ageNum < 18) {
    return res.status(400).json({ message: 'You must be 18 or older to join' });
  }

  const users = readJSON('users.json');
  if (users.some(u => u.email === email)) {
    return res.status(400).json({ message: 'An account with this email already exists' });
  }

  // Process referral code
  let referredBy = null;
  if (refCode && refCode.trim() !== '') {
    const cleaned = refCode.trim().toUpperCase();
    const referrer = users.find(u => u.refCode === cleaned);
    if (!referrer) {
      return res.status(400).json({ message: 'Invalid referral code' });
    }
    referredBy = referrer.id;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newRefCode = generateRefCode(users);

  const newUser = {
    id: Date.now().toString(),
    name,
    email,
    password: hashedPassword,
    age: ageNum,
    refCode: newRefCode,
    referredBy,
    pkg: 'None',
    roi: 0,
    balance: 0,
    deposited: 0,
    referralLink: `${REFERRAL_BASE}/ref/${newRefCode}`,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON('users.json', users);

  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...userWithoutPassword } = newUser;
  res.json({ token, user: userWithoutPassword });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const users = readJSON('users.json');
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ message: 'Invalid credentials' });
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...userWithoutPassword } = user;
  res.json({ token, user: userWithoutPassword });
});

if (user.blocked) {
  return res.status(403).json({ message: 'Your account has been blocked. Contact support.' });
}

module.exports = router;