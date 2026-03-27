const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

// Multer config for logo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = 'logo-' + Date.now() + ext;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
    const extOk = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowedTypes.test(file.mimetype) || file.mimetype === 'image/svg+xml';
    if (extOk || mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /api/config - public
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM config').all();
    const config = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// PUT /api/config - auth required
router.put('/', auth, (req, res) => {
  try {
    const db = getDb();
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const upsert = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value));
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/config/logo - auth required
router.post('/logo', auth, (req, res) => {
  upload.single('logo')(req, res, function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const db = getDb();

      // Delete old logo if exists
      const oldLogo = db.prepare("SELECT value FROM config WHERE key = 'logo_filename'").get();
      if (oldLogo && oldLogo.value) {
        const oldPath = path.join(__dirname, '..', 'uploads', oldLogo.value);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Save new logo filename in config
      db.prepare("INSERT INTO config (key, value) VALUES ('logo_filename', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(req.file.filename);

      res.json({ success: true, filename: req.file.filename });
    } catch (err2) {
      res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err2.message : 'Internal server error' });
    }
  });
});

// GET /api/config/logo - public
router.get('/logo', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM config WHERE key = 'logo_filename'").get();
    if (!row || !row.value) {
      return res.status(404).json({ error: 'No logo uploaded' });
    }

    const logoPath = path.join(__dirname, '..', 'uploads', row.value);
    if (!fs.existsSync(logoPath)) {
      return res.status(404).json({ error: 'Logo file not found' });
    }

    res.sendFile(logoPath);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = router;
