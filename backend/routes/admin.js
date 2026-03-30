const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');

// POST /api/admin/login
router.post('/login', (req, res) => {
  try {
    const db = getDb();
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!admin) {
      return res.status(401).json({ error: 'Admin account not found' });
    }

    const valid = bcrypt.compareSync(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '6h' }
    );

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 6 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/admin/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('admin_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  res.json({ success: true });
});

// PUT /api/admin/password
router.put('/password', auth, (req, res) => {
  try {
    const db = getDb();
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 12) {
      return res.status(400).json({ error: 'New password must be at least 12 characters' });
    }

    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!admin) {
      return res.status(404).json({ error: 'Admin account not found' });
    }

    const valid = bcrypt.compareSync(currentPassword, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admin SET password_hash = ? WHERE id = 1').run(newHash);

    // Invalidate the current session — the admin must log in again with the new password
    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/admin/wipe
router.post('/wipe', auth, (req, res) => {
  try {
    const db = getDb();
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required for data wipe' });
    }

    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!admin) {
      return res.status(404).json({ error: 'Admin account not found' });
    }

    const valid = bcrypt.compareSync(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const wipeAll = db.transaction(() => {
      db.prepare('DELETE FROM lucky_draw_results').run();
      db.prepare('DELETE FROM lucky_draw_rounds').run();
      db.prepare('DELETE FROM registration_table').run();
      db.prepare('DELETE FROM validation_table').run();
      db.prepare('DELETE FROM config').run();
      db.prepare('DELETE FROM admin').run();

      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
      if (!defaultPassword) throw new Error('DEFAULT_ADMIN_PASSWORD environment variable is required');
      const hash = bcrypt.hashSync(defaultPassword, 10);
      db.prepare('INSERT INTO admin (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);

      const defaultConfig = {
        heading_text: 'Lucky Draw',
        subtitle_text: '',
        logo_filename: '',
        bg_color1: '#667eea',
        bg_color2: '#764ba2',
        bg_color3: '#f093fb',
        bg_animation_speed: '8',
        registration_open: '0',
        registration_end_time: '',
        copyright_visible: '1',
        lucky_draw_rounds: '0'
      };

      const insertConfig = db.prepare('INSERT INTO config (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(defaultConfig)) {
        insertConfig.run(key, value);
      }
    });

    wipeAll();
    res.json({ success: true, message: 'All data wiped and defaults restored' });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// GET /api/admin/verify — lightweight session check (used by frontend on mount)
router.get('/verify', auth, (_req, res) => {
  res.json({ authenticated: true });
});

module.exports = router;
