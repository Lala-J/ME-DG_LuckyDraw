const express = require('express');
const registrationRouter = express.Router();
const validationRouter = express.Router();
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { emitter, broadcastStatusChange } = require('../events');
const { pruneSpecialChars, pruneBrackets, pruneCountryCode } = require('../utils/pruning');
const { sanitizeAuditInput } = require('../utils/sanitize');

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
        db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run(
          'registration_closed',
          JSON.stringify({ method: 'auto' })
        );
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

// GET /api/registration/status/stream — Server-Sent Events for real-time status updates
registrationRouter.get('/status/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Disable nginx/proxy response buffering so events reach the client immediately
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send current status immediately so the client is up-to-date on connect
  try {
    const db = getDb();
    const openRow = db.prepare("SELECT value FROM config WHERE key = 'registration_open'").get();
    const endRow  = db.prepare("SELECT value FROM config WHERE key = 'registration_end_time'").get();
    const isOpen  = !!(openRow && openRow.value === '1');
    const endTime = (endRow && endRow.value) || null;
    res.write(`data: ${JSON.stringify({ open: isOpen, endTime })}\n\n`);
  } catch (_) {}

  // Push future status changes
  const onStatusChange = (status) => {
    res.write(`data: ${JSON.stringify(status)}\n\n`);
  };
  emitter.on('registrationStatus', onStatusChange);

  // Heartbeat every 25 s — keeps the connection alive through proxies/firewalls
  const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 25000);

  req.on('close', () => {
    emitter.off('registrationStatus', onStatusChange);
    clearInterval(heartbeat);
  });
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

    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run(
      'registration_opened',
      JSON.stringify({ duration_seconds: durationSeconds, end_time: endTime })
    );

    broadcastStatusChange({ open: true, endTime });
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
    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run(
      'registration_closed',
      JSON.stringify({ method: 'manual' })
    );
    broadcastStatusChange({ open: false, endTime: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/registration - register a user (manual entry: fullName + phoneNumber)
registrationRouter.post('/', async (req, res) => {
  try {
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'Unknown';

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

      // Data Pruning experimental flags
      const ignoreSpecialChars = db.prepare("SELECT value FROM config WHERE key = 'exp_ignore_special_chars'").get()?.value === '1';
      const ignoreCountryCodes = db.prepare("SELECT value FROM config WHERE key = 'exp_ignore_country_codes'").get()?.value === '1';
      const ignoreBrackets     = db.prepare("SELECT value FROM config WHERE key = 'exp_ignore_brackets'").get()?.value === '1';

      // Apply name pruning (for comparison only — stored data is never modified)
      let checkName = trimmedName;
      if (ignoreBrackets)     checkName = pruneBrackets(checkName);
      if (ignoreSpecialChars) checkName = pruneSpecialChars(checkName);

      // Look up by phone number; if no direct match and country-code stripping
      // is enabled, retry with the country code removed.
      const allValidationRows = db.prepare('SELECT * FROM validation_table').all();
      let validationRow = allValidationRows.find(r => normalizePhone(r.phone_number) === inputPhone);
      if (!validationRow && ignoreCountryCodes) {
        const strippedPhone = pruneCountryCode(inputPhone);
        if (strippedPhone !== inputPhone) {
          validationRow = allValidationRows.find(r => normalizePhone(r.phone_number) === strippedPhone);
        }
      }

      if (!validationRow) {
        db.prepare('INSERT INTO audit_manual_registrations (status, full_name, phone_number, ip_address) VALUES (?, ?, ?, ?)').run(
          'rejected',
          sanitizeAuditInput(trimmedName),
          sanitizeAuditInput(phoneNumber),
          sanitizeAuditInput(clientIp)
        );
        return { status: 400, body: { success: false, message: 'Registration Failed. Double check your Full Name or Phone Number.' } };
      }

      const similarity = charSimilarity(checkName, validationRow.full_name);
      if (similarity < 0.85) {
        db.prepare('INSERT INTO audit_manual_registrations (status, full_name, phone_number, ip_address) VALUES (?, ?, ?, ?)').run(
          'rejected',
          sanitizeAuditInput(trimmedName),
          sanitizeAuditInput(phoneNumber),
          sanitizeAuditInput(clientIp)
        );
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
      db.prepare('INSERT INTO audit_manual_registrations (status, full_name, phone_number, ip_address) VALUES (?, ?, ?, ?)').run(
        'validated',
        validationRow.full_name,
        validationRow.phone_number,
        sanitizeAuditInput(clientIp)
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

    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run('registration_downloaded', '{}');
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
    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run('registration_deleted', '{}');
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
    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run(
      'validation_entry_selected',
      JSON.stringify({
        full_name:    full_name.trim(),
        staff_id:     staff_id.trim(),
        phone_number: (phone_number || '').trim(),
      })
    );
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

    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run('validation_downloaded', '{}');
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
      db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run(
        'validation_uploaded',
        JSON.stringify({ entry_count: count })
      );
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
    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run('validation_deleted', '{}');
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
    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run(
      'bulk_registration',
      JSON.stringify({ inserted, total: rows.length })
    );
    res.json({ success: true, inserted, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// PUT /api/validation/entry/:id — update an existing validation entry (Direct Editing)
validationRouter.put('/entry/:id', auth, (req, res) => {
  try {
    const db = getDb();
    const entryId = parseInt(req.params.id, 10);
    if (!entryId) return res.status(400).json({ error: 'Invalid entry ID.' });

    const { full_name, staff_id, phone_number, title, department, location } = req.body;
    if (!full_name || !phone_number) {
      return res.status(400).json({ error: 'Full Name and Phone Number are required.' });
    }

    const result = db.prepare(
      'UPDATE validation_table SET full_name=?, staff_id=?, phone_number=?, title=?, department=?, location=? WHERE id=?'
    ).run(
      full_name.trim(),
      (staff_id || '').trim(),
      phone_number.trim(),
      (title || '').trim(),
      (department || '').trim(),
      (location || '').trim(),
      entryId
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/validation/entry — add a new validation entry (Additional Entries)
// The database AUTOINCREMENT assigns the ID; clients cannot specify it,
// preserving the automatic sequential ordering of the validation table.
validationRouter.post('/entry', auth, (req, res) => {
  try {
    const db = getDb();
    const { full_name, staff_id, phone_number, title, department, location } = req.body;

    if (!full_name || !phone_number) {
      return res.status(400).json({ error: 'Full Name and Phone Number are required.' });
    }

    const trimmedEntry = {
      full_name:    full_name.trim(),
      staff_id:     (staff_id || '').trim(),
      phone_number: phone_number.trim(),
      title:        (title || '').trim(),
      department:   (department || '').trim(),
      location:     (location || '').trim(),
    };

    db.prepare(
      'INSERT INTO validation_table (full_name, staff_id, phone_number, title, department, location) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      trimmedEntry.full_name,
      trimmedEntry.staff_id,
      trimmedEntry.phone_number,
      trimmedEntry.title,
      trimmedEntry.department,
      trimmedEntry.location
    );

    db.prepare('INSERT INTO audit_reg_changes (action_type, details) VALUES (?, ?)').run(
      'validation_entry_added',
      JSON.stringify(trimmedEntry)
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = { registrationRouter, validationRouter, charSimilarity, normalizePhone };