const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const ALLOWED_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const FORMAT_MAP = {
  '.woff2': 'woff2',
  '.woff':  'woff',
  '.ttf':   'truetype',
  '.otf':   'opentype',
};

const fontsDir = () => {
  const dir = path.join(__dirname, '..', 'uploads', 'fonts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, fontsDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `font-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only font files (.ttf, .otf, .woff, .woff2) are allowed'));
    }
  },
});

// GET /api/fonts — list all uploaded fonts (public)
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const fonts = db.prepare(
      'SELECT id, display_name, css_family, filename, format FROM fonts ORDER BY id ASC'
    ).all();
    res.json(fonts);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/fonts — upload a font file (auth required)
router.post('/', auth, (req, res) => {
  upload.single('font')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const format = FORMAT_MAP[ext];

      // Derive a clean display name from the original filename
      const rawName = path.basename(req.file.originalname, ext);
      const displayName = rawName
        .replace(/[-_]+/g, ' ')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .slice(0, 64) || 'Untitled Font';

      const db = getDb();
      db.prepare(
        'INSERT INTO fonts (display_name, css_family, filename, format) VALUES (?, ?, ?, ?)'
      ).run(displayName, displayName, req.file.filename, format);

      const inserted = db.prepare(
        'SELECT id, display_name, css_family, filename, format FROM fonts WHERE filename = ?'
      ).get(req.file.filename);

      res.status(201).json(inserted);
    } catch (err2) {
      res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err2.message : 'Internal server error' });
    }
  });
});

// DELETE /api/fonts/:id — delete a font (auth required)
router.delete('/:id', auth, (req, res) => {
  try {
    const db = getDb();
    const font = db.prepare(
      'SELECT id, display_name, filename FROM fonts WHERE id = ?'
    ).get(req.params.id);

    if (!font) return res.status(404).json({ error: 'Font not found' });

    const filePath = path.join(fontsDir(), font.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM fonts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// GET /api/fonts/file/:filename — serve a font file (public, used by @font-face src)
router.get('/file/:filename', (req, res) => {
  try {
    // Sanitise — strip any path components to prevent traversal
    const filename = path.basename(req.params.filename);

    // Verify the file is actually a registered font (not an arbitrary upload)
    const db = getDb();
    const font = db.prepare('SELECT id FROM fonts WHERE filename = ?').get(filename);
    if (!font) return res.status(404).json({ error: 'Font not found' });

    const filePath = path.join(fontsDir(), filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Font file not found' });

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = router;
