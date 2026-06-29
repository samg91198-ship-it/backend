const express = require('express');
const { authenticate } = require('../middleware/auth');
const { readJSON, writeJSON } = require('../utils/db');

const router = express.Router();

// Submit a review
router.post('/', authenticate, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ message: 'Review text is required' });
  }

  const users = readJSON('users.json');
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const reviews = readJSON('reviews.json');
  const newReview = {
    id: Date.now().toString(),
    userId: user.id,
    userName: user.name,
    userInitials: user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  reviews.push(newReview);
  writeJSON('reviews.json', reviews);

  res.status(201).json(newReview);
});

// Get all reviews (latest first)
router.get('/', authenticate, (req, res) => {
  const reviews = readJSON('reviews.json');
  reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(reviews);
});

module.exports = router;