const express = require('express');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// List every user account (pending, approved, rejected). Admin only.
router.get('/users', requireAuth, requireAdmin, function (req, res) {
  const users = db.prepare(
    'SELECT id, username, role, status, created_at FROM users ORDER BY (status = \'pending\') DESC, created_at DESC'
  ).all();
  res.json({ users: users });
});

// Approve a pending registration.
router.post('/users/:id/approve', requireAuth, requireAdmin, function (req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  db.prepare("UPDATE users SET status = 'approved' WHERE id = ?").run(user.id);
  res.json({ ok: true });
});

// Reject a pending registration (keeps the row so the username stays taken
// and the admin has a record of it, but the account can never log in).
router.post('/users/:id/reject', requireAuth, requireAdmin, function (req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(user.id);
  res.json({ ok: true });
});

// Permanently delete a user account.
router.delete('/users/:id', requireAuth, requireAdmin, function (req, res) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.id === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account while signed in.' });
  }
  if (user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'approved'").get().n;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining admin account.' });
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

module.exports = router;
