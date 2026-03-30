const express = require('express');
const registrationRouter = express.Router();
const validationRouter = express.Router();
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel/CSV files are allowed'));
    }
  }
});

let writeQueue = Promise.resolve();
function serializeWrite(fn) {
  const result = writeQueue.then(fn).catch((err) => { throw err; });
  writeQueue = result.catch(() => {});
  return result;
}

function charSimilarity(a, b) {
  const freqA = {};
  const freqB = {};
  const strA = a.toLowerCase();
  const strB = b.toLowerCase();

  for (const c of strA) {
    freqA[c] = (freqA[c] || 0) + 1;
  }
  for (const c of strB) {
    freqB[c] = (freqB[c] || 0) + 1;
  }

  const allChars = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);
  let matchSum = 0;
  for (const c of allChars) {
    matchSum += Math.min(freqA[c] || 0, freqB[c] || 0);
  }

  const maxLen = Math.max(strA.length, strB.length);
  if (maxLen === 0) return 1;
  return matchSum / maxLen;
}

// Strip non-digit characters for phone number comparison
function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

// GET /api/registration/status
registrationRouter.get('/status', (req, res) => {
  try {
    const db = getDb();
    const openRow = db.prepare("SELECT value FROM config WHERE key = 'registration_open'").get();
    const endRow = db.prepare("SELECT value FROM config WHERE key = 'registration_end_time'").get();
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM registration_table').get();

    let isOpen = openRow && openRow.value === '1';
    const endTime = (endRow && endRow.value) ? endRow.value : null;

    // Auto-close if end time has passed
    if (isOpen && endTime) {
      const end = new Date(endTime);
      if (!isNaN(end.getTime()) && new Date() > end) {
        db.prepare("INSERT INTO config (key, value) VALUES ('registration_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
        isOpen = false;
      }
    }

    res.json({
      open: isOpen,
      endTime: endTime,
      registeredCount: countRow.cnt
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/registration/open - open registration with duration (auth required)
registrationRouter.post('/open', auth, (req, res) => {
  try {
    const db = getDb();
    const { durationSeconds } = req.body;

    if (!durationSeconds || durationSeconds <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive number of seconds' });
    }

    const endTime = new Date(Date.now() + durationSeconds * 1000).toISOString();

    const upsert = db.prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    upsert.run('registration_open', '1');
    upsert.run('registration_end_time', endTime);

    res.json({ success: true, endTime });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/registration/close - close registration (auth required)
registrationRouter.post('/close', auth, (req, res) => {
  try {
    const db = getDb();
    db.prepare("INSERT INTO config (key, value) VALUES ('registration_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/registration - register a user (manual entry: fullName + phoneNumber)
registrationRouter.post('/', async (req, res) => {
  try {
    const result = await serializeWrite(() => {
      const db = getDb();
      const { fullName, phoneNumber } = req.body;
      if (!fullName || !phoneNumber) {
        return { status: 400, body: { success: false, message: 'Full name and phone number are required' } };
      }

      const trimmedName = fullName.trim();

      if (trimmedName.length > 100) {
        return { status: 400, body: { success: false, message: 'Full name must be 100 characters or fewer' } };
      }

      const inputPhone = normalizePhone(phoneNumber);

      if (!inputPhone) {
        return { status: 400, body: { success: false, message: 'Invalid phone number format' } };
      }

      const openRow = db.prepare("SELECT value FROM config WHERE key = 'registration_open'").get();
      if (!openRow || openRow.value !== '1') {
        return { status: 400, body: { success: false, message: 'Registration is not open' } };
      }

      const endRow = db.prepare("SELECT value FROM config WHERE key = 'registration_end_time'").get();
      if (endRow && endRow.value) {
        const endTime = new Date(endRow.value);
        if (!isNaN(endTime.getTime()) && new Date() > endTime) {
          db.prepare("INSERT INTO config (key, value) VALUES ('registration_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
          return { status: 400, body: { success: false, message: 'Registration has ended' } };
        }
      }

      // Look up by phone number in validation_table
      const allValidationRows = db.prepare('SELECT * FROM validation_table').all();
      const validationRow = allValidationRows.find(r => normalizePhone(r.phone_number) === inputPhone);

      if (!validationRow) {
        return { status: 400, body: { success: false, message: 'Registration Failed. Double check your Full Name or Phone Number.' } };
      }

      const similarity = charSimilarity(trimmedName, validationRow.full_name);
      if (similarity < 0.85) {
        return { status: 400, body: { success: false, message: 'Registration Failed. Double check your Full Name or Phone Number.' } };
      }

      const existing = db.prepare('SELECT id FROM registration_table WHERE staff_id = ?').get(validationRow.staff_id);
      if (existing) {
        return { status: 400, body: { success: false, message: 'This staff member is already registered.' } };
      }

      db.prepare('INSERT INTO registration_table (full_name, staff_id, phone_number, title, department, location) VALUES (?, ?, ?, ?, ?, ?)').run(
        validationRow.full_name,
        validationRow.staff_id,
        validationRow.phone_number,
        validationRow.title || '',
        validationRow.department || '',
        validationRow.location || ''
      );
      return { status: 200, body: { success: true, message: 'Registration successful!' } };
    });

    res.status(result.status).json(result.body);
  } catch (err) {
    res.status(500).json({ success: false, message: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// GET /api/registration/table
registrationRouter.get('/table', auth, (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';

    let totalRow, rows;
    if (search) {
      const like = `%${search}%`;
      totalRow = db.prepare('SELECT COUNT(*) as cnt FROM registration_table WHERE full_name LIKE ? OR staff_id LIKE ? OR phone_number LIKE ? OR department LIKE ?').get(like, like, like, like);
      rows = db.prepare('SELECT * FROM registration_table WHERE full_name LIKE ? OR staff_id LIKE ? OR phone_number LIKE ? OR department LIKE ? ORDER BY id ASC LIMIT ? OFFSET ?').all(like, like, like, like, limit, offset);
    } else {
      totalRow = db.prepare('SELECT COUNT(*) as cnt FROM registration_table').get();
      rows = db.prepare('SELECT * FROM registration_table ORDER BY id ASC LIMIT ? OFFSET ?').all(limit, offset);
    }

    res.json({
      data: rows,
      total: totalRow.cnt,
      page,
      limit,
      totalPages: Math.ceil(totalRow.cnt / limit)
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// GET /api/registration/download
registrationRouter.get('/download', auth, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT full_name, staff_id, phone_number, prize_winner_mark, registered_at, title, department, location FROM registration_table ORDER BY id ASC').all();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['full_name', 'staff_id', 'phone_number', 'prize_winner_mark', 'registered_at', 'title', 'department', 'location']
    });
    ws['A1'] = { v: 'Full Name', t: 's' };
    ws['B1'] = { v: 'Staff ID', t: 's' };
    ws['C1'] = { v: 'Phone Number', t: 's' };
    ws['D1'] = { v: 'Prize Winner', t: 's' };
    ws['E1'] = { v: 'Registered At', t: 's' };
    ws['F1'] = { v: 'Title', t: 's' };
    ws['G1'] = { v: 'Department', t: 's' };
    ws['H1'] = { v: 'Location', t: 's' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.xlsx"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/registration/clear
registrationRouter.post('/clear', auth, (req, res) => {
  try {
    const db = getDb();
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const clearTable = db.transaction(() => {
      db.prepare('DELETE FROM lucky_draw_results').run();
      db.prepare('DELETE FROM lucky_draw_rounds').run();
      db.prepare("INSERT INTO config (key, value) VALUES ('lucky_draw_rounds', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
      db.prepare('DELETE FROM registration_table').run();
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'registration_table'").run();
    });
    clearTable();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/registration/add-entry
registrationRouter.post('/add-entry', auth, (req, res) => {
  try {
    const db = getDb();
    const { full_name, staff_id, phone_number, title, department, location } = req.body;
    if (!full_name || !staff_id) {
      return res.status(400).json({ error: 'Full name and staff ID are required' });
    }
    const result = db.prepare('INSERT OR IGNORE INTO registration_table (full_name, staff_id, phone_number, title, department, location) VALUES (?, ?, ?, ?, ?, ?)').run(
      full_name.trim(),
      staff_id.trim(),
      (phone_number || '').trim(),
      (title || '').trim(),
      (department || '').trim(),
      (location || '').trim()
    );
    if (result.changes === 0) {
      return res.status(400).json({ error: 'Staff ID is already registered' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// ===================== VALIDATION ROUTES =====================

// GET /api/validation/table
validationRouter.get('/table', auth, (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';

    let totalRow, rows;
    if (search) {
      const like = `%${search}%`;
      totalRow = db.prepare('SELECT COUNT(*) as cnt FROM validation_table WHERE full_name LIKE ? OR staff_id LIKE ? OR phone_number LIKE ? OR department LIKE ?').get(like, like, like, like);
      rows = db.prepare('SELECT * FROM validation_table WHERE full_name LIKE ? OR staff_id LIKE ? OR phone_number LIKE ? OR department LIKE ? ORDER BY id ASC LIMIT ? OFFSET ?').all(like, like, like, like, limit, offset);
    } else {
      totalRow = db.prepare('SELECT COUNT(*) as cnt FROM validation_table').get();
      rows = db.prepare('SELECT * FROM validation_table ORDER BY id ASC LIMIT ? OFFSET ?').all(limit, offset);
    }

    res.json({
      data: rows,
      total: totalRow.cnt,
      page,
      limit,
      totalPages: Math.ceil(totalRow.cnt / limit)
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// GET /api/validation/download
validationRouter.get('/download', auth, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT full_name, staff_id, phone_number, title, department, location FROM validation_table ORDER BY id ASC').all();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['full_name', 'staff_id', 'phone_number', 'title', 'department', 'location']
    });
    ws['A1'] = { v: 'Full Name', t: 's' };
    ws['B1'] = { v: 'Staff ID', t: 's' };
    ws['C1'] = { v: 'Phone Number', t: 's' };
    ws['D1'] = { v: 'Title', t: 's' };
    ws['E1'] = { v: 'Department', t: 's' };
    ws['F1'] = { v: 'Location', t: 's' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Validation');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="validation.xlsx"');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/validation/upload
validationRouter.post('/upload', auth, (req, res) => {
  upload.single('file')(req, res, function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const db = getDb();
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', raw: true });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

      if (jsonData.length === 0) {
        return res.status(400).json({ error: 'Excel file is empty' });
      }

      const firstRow = jsonData[0];
      const keys = Object.keys(firstRow);

      // Detect Full Name column
      let nameCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'fullname');
      if (!nameCol) nameCol = keys.find(k => k.toLowerCase().includes('name'));

      // Detect Staff ID column
      let idCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'staffid');
      if (!idCol) idCol = keys.find(k => k.toLowerCase().includes('staff'));
      if (!idCol) idCol = keys.find(k => k.toLowerCase() === 'id');

      // Detect Phone Number column
      let phoneCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'phonenumber');
      if (!phoneCol) phoneCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'mobilephonenumber');
      if (!phoneCol) phoneCol = keys.find(k => k.toLowerCase().includes('phone'));
      if (!phoneCol) phoneCol = keys.find(k => k.toLowerCase().includes('mobile'));

      if (!nameCol || !idCol || !phoneCol) {
        return res.status(400).json({
          error: 'Excel must have "Full Name", "Staff ID", and "Phone Number" columns. Found: ' + keys.join(', ')
        });
      }

      // Detect optional Title column
      let titleCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'jobtitle');
      if (!titleCol) titleCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'title' && k !== nameCol);
      if (!titleCol) titleCol = keys.find(k => k.toLowerCase().includes('title') && k !== nameCol);

      // Detect optional Department column
      let deptCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'department');
      if (!deptCol) deptCol = keys.find(k => k.toLowerCase().includes('department'));
      if (!deptCol) deptCol = keys.find(k => k.toLowerCase().includes('dept'));

      // Detect optional Location column
      let locationCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'officelocation');
      if (!locationCol) locationCol = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'location');
      if (!locationCol) locationCol = keys.find(k => k.toLowerCase().includes('location'));
      if (!locationCol) locationCol = keys.find(k => k.toLowerCase().includes('office') && k !== nameCol);

      const insertMany = db.transaction((rows) => {
        db.prepare('DELETE FROM validation_table').run();
        db.prepare("DELETE FROM sqlite_sequence WHERE name = 'validation_table'").run();
        const insert = db.prepare('INSERT INTO validation_table (full_name, staff_id, phone_number, title, department, location) VALUES (?, ?, ?, ?, ?, ?)');
        let insertedCount = 0;
        for (const row of rows) {
          const name = String(row[nameCol]).trim();
          const sid = String(row[idCol]).trim();
          const phone = String(row[phoneCol]).trim();
          const title = titleCol ? String(row[titleCol] || '').trim() : '';
          const dept = deptCol ? String(row[deptCol] || '').trim() : '';
          const loc = locationCol ? String(row[locationCol] || '').trim() : '';
          if (name && sid) {
            insert.run(name, sid, phone, title, dept, loc);
            insertedCount++;
          }
        }
        return insertedCount;
      });

      const count = insertMany(jsonData);
      res.json({ success: true, count });
    } catch (err2) {
      res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err2.message : 'Internal server error' });
    }
  });
});

// POST /api/validation/clear
validationRouter.post('/clear', auth, (req, res) => {
  try {
    const db = getDb();
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const clearTable = db.transaction(() => {
      db.prepare('DELETE FROM validation_table').run();
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'validation_table'").run();
    });
    clearTable();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/validation/to-registration
validationRouter.post('/to-registration', auth, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT full_name, staff_id, phone_number, title, department, location FROM validation_table').all();

    const copyAll = db.transaction((entries) => {
      const insert = db.prepare('INSERT OR IGNORE INTO registration_table (full_name, staff_id, phone_number, title, department, location) VALUES (?, ?, ?, ?, ?, ?)');
      let inserted = 0;
      for (const row of entries) {
        const result = insert.run(
          row.full_name,
          row.staff_id,
          row.phone_number || '',
          row.title || '',
          row.department || '',
          row.location || ''
        );
        if (result.changes > 0) inserted++;
      }
      return inserted;
    });

    const inserted = copyAll(rows);
    res.json({ success: true, inserted, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = { registrationRouter, validationRouter, charSimilarity, normalizePhone };