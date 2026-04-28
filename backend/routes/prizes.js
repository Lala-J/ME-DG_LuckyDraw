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
    db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
      'prize_added', JSON.stringify({ prize_name: name || '' })
    );
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
    const existing = db.prepare('SELECT name FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
    const oldName = existing ? existing.name : '';
    const result = db.prepare('UPDATE prizes SET name = ? WHERE prize_id = ?').run(name || '', req.params.prizeId);
    if (result.changes === 0) return res.status(404).json({ error: 'Prize not found' });
    if (oldName !== (name || '')) {
      db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
        'prize_name_changed', JSON.stringify({ old_name: oldName, new_name: name || '' })
      );
    }
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
      const picPath = path.resolve(prizePicsDir(), path.basename(prize.picture_filename));
      if (picPath.startsWith(path.resolve(prizePicsDir())) && fs.existsSync(picPath)) fs.unlinkSync(picPath);
    }

    db.prepare('DELETE FROM prize_exclusion_policies WHERE prize_id = ?').run(req.params.prizeId);
    db.prepare('DELETE FROM prizes WHERE prize_id = ?').run(req.params.prizeId);
    db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
      'prize_deleted', JSON.stringify({ prize_name: prize.name })
    );
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
      db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
        'prize_image_deleted', JSON.stringify({ prize_name: prize.name })
      );
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
      db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
        'prize_image_replaced', JSON.stringify({ prize_name: prize.name })
      );
      res.json({ success: true, filename: req.file.filename, picturePath: `/api/prizes/${req.params.prizeId}/picture` });
    } catch (err2) {
      res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err2.message : 'Internal server error' });
    }
  });
});

// ── Exclusion Policy routes ────────────────────────────────────────────────
// Categories the admin may use for an exclusion policy.
const EXCLUSION_CATEGORIES = ['full_name', 'staff_id', 'phone_number', 'title', 'department', 'location', 'employment_type'];
const EXCLUSION_CATEGORY_LABELS = {
  full_name:       'Full Name',
  staff_id:        'Staff ID',
  phone_number:    'Phone Number',
  title:           'Title',
  department:      'Department',
  location:        'Location',
  employment_type: 'Employment Type',
};

function parseTags(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// GET /api/prizes/:prizeId/exclusions — list exclusion policies for a prize
router.get('/:prizeId/exclusions', auth, (req, res) => {
  try {
    const db = getDb();
    const prize = db.prepare('SELECT prize_id FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
    if (!prize) return res.status(404).json({ error: 'Prize not found' });
    const rows = db.prepare('SELECT id, category, tags FROM prize_exclusion_policies WHERE prize_id = ? ORDER BY id ASC').all(req.params.prizeId);
    res.json(rows.map(r => ({ id: r.id, category: r.category, tags: parseTags(r.tags) })));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// GET /api/prizes/exclusions/categories — list available categories + their distinct values
router.get('/exclusions/categories', auth, (_req, res) => {
  try {
    const db = getDb();
    const result = {};
    for (const cat of EXCLUSION_CATEGORIES) {
      const rows = db.prepare(`SELECT DISTINCT ${cat} as v FROM registration_table WHERE ${cat} IS NOT NULL AND ${cat} != '' ORDER BY ${cat} ASC`).all();
      const valRows = db.prepare(`SELECT DISTINCT ${cat} as v FROM validation_table WHERE ${cat} IS NOT NULL AND ${cat} != '' ORDER BY ${cat} ASC`).all();
      const set = new Set();
      for (const r of rows) set.add(r.v);
      for (const r of valRows) set.add(r.v);
      result[cat] = { label: EXCLUSION_CATEGORY_LABELS[cat], values: Array.from(set).sort() };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// PUT /api/prizes/:prizeId/exclusions — replace the exclusion policy set for a prize
router.put('/:prizeId/exclusions', auth, (req, res) => {
  try {
    const db = getDb();
    const prize = db.prepare('SELECT prize_id, name FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
    if (!prize) return res.status(404).json({ error: 'Prize not found' });

    const { policies } = req.body;
    if (!Array.isArray(policies)) return res.status(400).json({ error: 'policies must be an array' });

    const seen = new Set();
    for (const p of policies) {
      if (!p || typeof p !== 'object') return res.status(400).json({ error: 'Invalid policy entry' });
      if (!EXCLUSION_CATEGORIES.includes(p.category)) {
        return res.status(400).json({ error: `Unknown category: ${p.category}` });
      }
      if (seen.has(p.category)) {
        return res.status(400).json({ error: `Category ${p.category} appears more than once` });
      }
      seen.add(p.category);
      if (!Array.isArray(p.tags)) return res.status(400).json({ error: 'tags must be an array' });
    }

    const old = db.prepare('SELECT category, tags FROM prize_exclusion_policies WHERE prize_id = ? ORDER BY id ASC').all(req.params.prizeId);
    const oldByCat = {};
    for (const o of old) oldByCat[o.category] = parseTags(o.tags);

    db.transaction(() => {
      db.prepare('DELETE FROM prize_exclusion_policies WHERE prize_id = ?').run(req.params.prizeId);
      const insert = db.prepare('INSERT INTO prize_exclusion_policies (prize_id, category, tags) VALUES (?, ?, ?)');
      for (const p of policies) {
        const cleanTags = Array.from(new Set(p.tags.map(t => String(t)).filter(t => t.length > 0)));
        insert.run(req.params.prizeId, p.category, JSON.stringify(cleanTags));
      }
    })();

    // Determine what actually changed for audit logging
    const newByCat = {};
    for (const p of policies) {
      newByCat[p.category] = Array.from(new Set(p.tags.map(t => String(t)).filter(t => t.length > 0)));
    }

    const allCats = new Set([...Object.keys(oldByCat), ...Object.keys(newByCat)]);
    const auditInsert = db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)');
    for (const cat of allCats) {
      const oldTags = oldByCat[cat] || [];
      const newTags = newByCat[cat] || [];
      const same = oldTags.length === newTags.length && oldTags.every(t => newTags.includes(t));
      if (same) continue;
      let change;
      if (!oldByCat[cat])      change = 'added';
      else if (!newByCat[cat]) change = 'removed';
      else                     change = 'modified';
      auditInsert.run('exclusion_policy_modified', JSON.stringify({
        prize_id:       prize.prize_id,
        prize_name:     prize.name || '',
        category:       cat,
        category_label: EXCLUSION_CATEGORY_LABELS[cat] || cat,
        tags:           newTags,
        change,
      }));
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// GET /api/prizes/:prizeId/picture — serve picture
router.get('/:prizeId/picture', auth, (req, res) => {
  try {
    const db = getDb();
    const prize = db.prepare('SELECT * FROM prizes WHERE prize_id = ?').get(req.params.prizeId);
    if (!prize || !prize.picture_filename) return res.status(404).json({ error: 'No picture' });

    const picsDir = path.resolve(prizePicsDir());
    const picPath = path.resolve(picsDir, path.basename(prize.picture_filename));
    if (!picPath.startsWith(picsDir)) return res.status(400).json({ error: 'Invalid filename' });
    if (!fs.existsSync(picPath)) return res.status(404).json({ error: 'File not found' });

    res.sendFile(picPath);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = router;
