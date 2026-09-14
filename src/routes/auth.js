const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

// Public: request a new account. The account is created in 'pending'
// status and cannot log in until an admin approves it.
router.post('/register', function (req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, dots, dashes, or underscores.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, 'user', 'pending')").run(username, hash);
  return res.status(201).json({ ok: true, message: 'Registration submitted. An administrator must approve your account before you can sign in.' });
});

router.post('/login', function (req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Your account is awaiting admin approval.' });
  }
  if (user.status !== 'approved') {
    return res.status(403).json({ error: 'Your account does not have access. Contact an administrator.' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  return res.json({ username: user.username, role: user.role });
});

router.post('/logout', function (req, res) {
  req.session = null;
  res.json({ ok: true });
});

router.get('/session', function (req, res) {
  if (req.session && req.session.username) {
    return res.json({ loggedIn: true, username: req.session.username, role: req.session.role || 'user' });
  }
  return res.json({ loggedIn: false });
});

router.post('/change-password', requireAuth, function (req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

module.exports = router;
