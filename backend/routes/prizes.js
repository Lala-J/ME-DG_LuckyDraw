const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const prizePicsDir = () => {
  const dir = path.join(__dirname, '..', 'uploads', 'prizes');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, prizePicsDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'prize-' + Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extOk = /jpeg|jpg|png|gif|svg|webp/.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = /^image\//.test(file.mimetype);
    (extOk || mimeOk) ? cb(null, true) : cb(new Error('Only image files are allowed'));
  }
});

function nextPrizeId(db) {
  const used = new Set(
    db.prepare('SELECT prize_id FROM prizes').all().map(p => parseInt(p.prize_id.replace('PZE-', '')))
  );
  let n = 1;
  while (used.has(n)) n++;
  return `PZE-${String(n).padStart(4, '0')}`;
}

// GET /api/prizes — list all prizes with assignment info
router.get('/', auth, (req, res) => {
  try {
    const db = getDb();
    const prizes = db.prepare('SELECT * FROM prizes ORDER BY id ASC').all();
    const assignments = db.prepare('SELECT prize_id, round_number FROM lucky_draw_round_prizes').all();
    const assignMap = {};
    for (const a of assignments) assignMap[a.prize_id] = a.round_number;

    res.json(prizes.map(p => ({
      ...p,
      assignedRound: assignMap[p.prize_id] || null,
      picturePath: p.picture_filename ? `/api/prizes/${p.prize_id}/picture` : null
    })));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/prizes — create new prize
router.post('/', auth, (req, res) => {
  try {
    const db = getDb();
    const { name } = req.body;
    const prizeId = nextPrizeId(db);
    db.prepare('INSERT INTO prizes (prize_id, name, picture_filename) VALUES (?, ?, ?)').run(prizeId, name || '', '');
    const prize = db.prepare('SELECT * FROM prizes WHERE prize_id = ?').get(prizeId);
    res.json({ ...prize, assignedRound: null, picturePath: null });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// PUT /api/prizes/:prizeId — update prize name
router.put('/:prizeId', auth, (req, res) => {
  try {
    const db = getDb();
    const { name } = req.body;
    const result = db.prepare('UPDATE prizes SET name = ? WHERE prize_id = ?').run(name || '', req.params.prizeId);
    if (result.changes === 0) return res.status(404).json({ error: 'Prize not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// DELETE /api/prizes/:prizeId
router.delete('/:prizeId', auth, (req, res) => {
  try {
    const db = getDb();
    const prize = db.prepare('SELECT * FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
    if (!prize) return res.status(404).json({ error: 'Prize not found' });

    const assigned = db.prepare('SELECT * FROM lucky_draw_round_prizes WHERE prize_id = ?').get(req.params.prizeId);
    if (assigned) return res.status(400).json({ error: 'Prize is assigned to a round. Remove it from the round first.' });

    const usedInResult = db.prepare('SELECT id FROM lucky_draw_results WHERE prize_id = ?').get(req.params.prizeId);
    if (usedInResult) return res.status(400).json({ error: 'Prize has already been awarded. Reset the round first.' });

    if (prize.picture_filename) {
      const picPath = path.join(prizePicsDir(), prize.picture_filename);
      if (fs.existsSync(picPath)) fs.unlinkSync(picPath);
    }

    db.prepare('DELETE FROM prizes WHERE prize_id = ?').run(req.params.prizeId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// DELETE /api/prizes/:prizeId/picture — remove prize picture
router.delete('/:prizeId/picture', auth, (req, res) => {
  try {
    const db = getDb();
    const prize = db.prepare('SELECT * FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
    if (!prize) return res.status(404).json({ error: 'Prize not found' });

    if (prize.picture_filename) {
      const picPath = path.join(prizePicsDir(), prize.picture_filename);
      if (fs.existsSync(picPath)) fs.unlinkSync(picPath);
      db.prepare('UPDATE prizes SET picture_filename = ? WHERE prize_id = ?').run('', req.params.prizeId);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/prizes/:prizeId/picture — upload prize picture
router.post('/:prizeId/picture', auth, (req, res) => {
  upload.single('picture')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const db = getDb();
      const prize = db.prepare('SELECT * FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
      if (!prize) return res.status(404).json({ error: 'Prize not found' });

      if (prize.picture_filename) {
        const oldPath = path.join(prizePicsDir(), prize.picture_filename);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      db.prepare('UPDATE prizes SET picture_filename = ? WHERE prize_id = ?').run(req.file.filename, req.params.prizeId);
      res.json({ success: true, filename: req.file.filename, picturePath: `/api/prizes/${req.params.prizeId}/picture` });
    } catch (err2) {
      res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err2.message : 'Internal server error' });
    }
  });
});

// GET /api/prizes/:prizeId/picture — serve picture
router.get('/:prizeId/picture', auth, (req, res) => {
  try {
    const db = getDb();
    const prize = db.prepare('SELECT * FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
    if (!prize || !prize.picture_filename) return res.status(404).json({ error: 'No picture' });

    const picPath = path.join(prizePicsDir(), prize.picture_filename);
    if (!fs.existsSync(picPath)) return res.status(404).json({ error: 'File not found' });

    res.sendFile(picPath);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = router;
