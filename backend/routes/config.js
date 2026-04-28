const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { JWT_SECRET, ADMIN_COOKIE_NAME } = auth;
const { sanitizeAuditInput } = require('../utils/sanitize');

// Returns true if the request carries a valid admin session cookie.
// Used by GET /api/config to decide whether to include backend-only keys
// (PRIVATE_CONFIG_KEYS) without rejecting unauthenticated public callers.
function hasValidAdminSession(req) {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return decoded.type === 'admin';
  } catch {
    return false;
  }
}

// Keys tracked in the home-screen audit log and their display labels
const AUDIT_FIELD_LABELS = {
  heading_text:  'Heading Text',
  subtitle_text: 'Subtitle Text',
  logo_size:     'Logo Display Size',
  organisation:  'Organisation',
};

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

// Backend-only config keys that must never be exposed to unauthenticated users.
const PRIVATE_CONFIG_KEYS = new Set([
  'exp_bulk_reg_enabled',
  'exp_selective_reg_enabled',
  'exp_ignore_special_chars',
  'exp_ignore_country_codes',
  'exp_ignore_brackets',
  'exp_validation_editing',
  'exp_additional_entries',
]);

// GET /api/config - public for non-private keys; backend experimental flags
// (PRIVATE_CONFIG_KEYS) are included only when the request carries a valid
// admin session cookie. This lets the admin UI read its own saved state
// without exposing those flags to unauthenticated visitors.
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM config').all();
    const includePrivate = hasValidAdminSession(req);
    const config = {};
    for (const row of rows) {
      if (includePrivate || !PRIVATE_CONFIG_KEYS.has(row.key)) {
        config[row.key] = row.value;
      }
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// PUT /api/config/secure - auth + admin-password verification required.
// Used by the Backend Experimental Features modals so that each setting
// change requires the admin to re-confirm their password.
router.put('/secure', auth, (req, res) => {
  try {
    const db = getDb();
    const { password, ...updates } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No settings provided.' });
    }

    // Backend Experimental Feature keys that have dedicated audit action types
    const BACKEND_EXP_AUDIT_MAP = {
      exp_bulk_reg_enabled:      'reg_bulk_changed',
      exp_selective_reg_enabled: 'reg_selective_changed',
      exp_ignore_special_chars:  'data_ignore_special_chars_changed',
      exp_ignore_country_codes:  'data_ignore_country_codes_changed',
      exp_ignore_brackets:       'data_ignore_brackets_changed',
      exp_validation_editing:    'direct_validation_editing_changed',
      exp_additional_entries:    'direct_additional_entries_changed',
    };

    // Only allow backend experimental feature keys through this endpoint
    const forbidden = Object.keys(updates).filter(k => !(k in BACKEND_EXP_AUDIT_MAP));
    if (forbidden.length > 0) {
      return res.status(403).json({ error: `Keys not allowed via secure endpoint: ${forbidden.join(', ')}` });
    }

    // Read old values for any auditable keys present in the update
    const backendExpOld = {};
    for (const k of Object.keys(BACKEND_EXP_AUDIT_MAP)) {
      if (k in updates) {
        const row = db.prepare('SELECT value FROM config WHERE key = ?').get(k);
        backendExpOld[k] = row ? row.value : '';
      }
    }

    const upsert = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value));
    }

    // Log backend experimental feature changes
    const expAudit = db.prepare('INSERT INTO audit_exp_changes (action_type, details) VALUES (?, ?)');
    for (const [key, actionType] of Object.entries(BACKEND_EXP_AUDIT_MAP)) {
      if (key in updates && String(updates[key]) !== backendExpOld[key]) {
        expAudit.run(actionType, JSON.stringify({ enabled: String(updates[key]) === '1' }));
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// Keys that may be written without password re-verification.
// Backend Experimental Feature flags are intentionally excluded — they must go
// through PUT /api/config/secure.  Frontend Experimental Feature keys (Winner
// Card, Stage Modification, Font Family) are included here because they are
// toggled/adjusted inline in the UI without a separate password step.
const UNPROTECTED_CONFIG_KEYS = new Set([
  'heading_text',
  'subtitle_text',
  'logo_size',
  'organisation',
  'bg_color1',
  'bg_color2',
  'bg_color3',
  'bg_animation_speed',
  'copyright_visible',
  // Winner Card
  'exp_winner_card_enabled',
  'exp_winner_card_field1',
  'exp_winner_card_field2',
  'exp_winner_card_field3',
  'exp_winner_card_field4',
  // Stage Modification
  'exp_stage_mod_enabled',
  'exp_stage_mod_no_group',
  'exp_stage_mod_manual_suspense',
  'exp_transition_card_delay',
  'exp_transition_round_timeout',
  'exp_transition_suspense_delay',
  // Font Family
  'exp_font_enabled',
  'exp_font_header_id',
  'exp_font_body_id',
]);

// PUT /api/config - auth required
router.put('/', auth, (req, res) => {
  try {
    const db = getDb();
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const forbidden = Object.keys(updates).filter(k => !UNPROTECTED_CONFIG_KEYS.has(k));
    if (forbidden.length > 0) {
      return res.status(403).json({ error: `These keys require password verification: ${forbidden.join(', ')}` });
    }

    // Read old values for home-screen audit-tracked keys before overwriting
    const trackedKeys = Object.keys(updates).filter(k => AUDIT_FIELD_LABELS[k]);
    const oldValues = {};
    for (const key of trackedKeys) {
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
      oldValues[key] = row ? (row.value || '') : '';
    }

    // Read old values for website audit-tracked keys before overwriting
    const WEBSITE_KEYS = ['bg_color1', 'bg_color2', 'bg_color3', 'bg_animation_speed', 'copyright_visible'];
    const websiteOld = {};
    for (const key of WEBSITE_KEYS) {
      if (key in updates) {
        const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
        websiteOld[key] = row ? (row.value || '') : '';
      }
    }

    const upsert = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(key, String(value));
    }

    // Log home-screen field changes
    const auditInsert = db.prepare('INSERT INTO audit_home_changes (field, old_value, new_value) VALUES (?, ?, ?)');
    for (const key of trackedKeys) {
      const newVal = String(updates[key]);
      const oldVal = oldValues[key];
      if (oldVal !== newVal) {
        auditInsert.run(AUDIT_FIELD_LABELS[key], sanitizeAuditInput(oldVal), sanitizeAuditInput(newVal));
      }
    }

    // Log website field changes
    const websiteAudit = db.prepare('INSERT INTO audit_website_changes (field, old_value, new_value) VALUES (?, ?, ?)');

    // Gradient colours — logged as one row if any of the three colors changed
    const colorKeys = ['bg_color1', 'bg_color2', 'bg_color3'];
    if (colorKeys.some(k => k in updates)) {
      // Ensure old values are available for all three colors even if some were not in the update
      for (const k of colorKeys) {
        if (!(k in websiteOld)) {
          const row = db.prepare('SELECT value FROM config WHERE key = ?').get(k);
          websiteOld[k] = row ? (row.value || '') : '';
        }
      }
      const oldStr = colorKeys.map(k => websiteOld[k]).join(', ');
      const newStr = colorKeys.map(k => k in updates ? String(updates[k]) : websiteOld[k]).join(', ');
      if (oldStr !== newStr) {
        websiteAudit.run('Gradient Colour', sanitizeAuditInput(oldStr), sanitizeAuditInput(newStr));
      }
    }

    // Gradient speed
    if ('bg_animation_speed' in updates) {
      const oldSpd = websiteOld['bg_animation_speed'];
      const newSpd = String(updates['bg_animation_speed']);
      if (oldSpd !== newSpd) {
        websiteAudit.run('Gradient Speed', sanitizeAuditInput(oldSpd), sanitizeAuditInput(newSpd));
      }
    }

    // Copyright visibility
    if ('copyright_visible' in updates) {
      const oldVis = websiteOld['copyright_visible'];
      const newVis = String(updates['copyright_visible']);
      if (oldVis !== newVis) {
        const oldLabel = oldVis === '1' ? 'On' : 'Off';
        const newLabel = newVis === '1' ? 'On' : 'Off';
        websiteAudit.run('Copyright Visibility', oldLabel, newLabel);
      }
    }

    // ── Frontend Experimental Feature audit logging ───────────────────────────

    const EXP_WINNER_KEYS      = ['exp_winner_card_enabled', 'exp_winner_card_field1', 'exp_winner_card_field2', 'exp_winner_card_field3', 'exp_winner_card_field4'];
    const EXP_STAGE_MOD_KEYS   = ['exp_stage_mod_enabled', 'exp_stage_mod_no_group'];
    const EXP_MANUAL_SUSP_KEYS = ['exp_stage_mod_manual_suspense'];
    const EXP_TRANSITION_KEYS  = ['exp_transition_card_delay', 'exp_transition_round_timeout', 'exp_transition_suspense_delay'];
    const EXP_FONT_KEYS        = ['exp_font_enabled', 'exp_font_header_id', 'exp_font_body_id'];
    const hasExpKey = [...EXP_WINNER_KEYS, ...EXP_STAGE_MOD_KEYS, ...EXP_MANUAL_SUSP_KEYS, ...EXP_TRANSITION_KEYS, ...EXP_FONT_KEYS].some(k => k in updates);

    if (hasExpKey) {
      // Read old stored values for all exp keys in this update
      const expOld = {};
      for (const k of [...EXP_WINNER_KEYS, ...EXP_STAGE_MOD_KEYS, ...EXP_MANUAL_SUSP_KEYS, ...EXP_TRANSITION_KEYS, ...EXP_FONT_KEYS]) {
        const row = db.prepare('SELECT value FROM config WHERE key = ?').get(k);
        expOld[k] = row ? row.value : '';
      }

      const expAudit = db.prepare('INSERT INTO audit_exp_changes (action_type, details) VALUES (?, ?)');

      // Winner Card — log if any winner card key actually changed
      if (EXP_WINNER_KEYS.some(k => k in updates && String(updates[k]) !== expOld[k])) {
        expAudit.run('winner_card_changed', JSON.stringify({
          enabled: String(updates['exp_winner_card_enabled'] ?? expOld['exp_winner_card_enabled']) === '1',
          fields: [
            updates['exp_winner_card_field1'] ?? expOld['exp_winner_card_field1'],
            updates['exp_winner_card_field2'] ?? expOld['exp_winner_card_field2'],
            updates['exp_winner_card_field3'] ?? expOld['exp_winner_card_field3'],
            updates['exp_winner_card_field4'] ?? expOld['exp_winner_card_field4'],
          ],
        }));
      }

      // Stage Mod — Disable Grouped Winners: log only when no_group itself changed
      if ('exp_stage_mod_no_group' in updates && String(updates['exp_stage_mod_no_group']) !== expOld['exp_stage_mod_no_group']) {
        expAudit.run('stage_mod_no_group_changed', JSON.stringify({
          enabled:  String(updates['exp_stage_mod_enabled']  ?? expOld['exp_stage_mod_enabled'])  === '1',
          no_group: String(updates['exp_stage_mod_no_group'] ?? expOld['exp_stage_mod_no_group']) === '1',
        }));
      }

      // Stage Mod — Manual Suspense: log only when the toggle itself changed
      if ('exp_stage_mod_manual_suspense' in updates && String(updates['exp_stage_mod_manual_suspense']) !== expOld['exp_stage_mod_manual_suspense']) {
        expAudit.run('stage_mod_manual_suspense_changed', JSON.stringify({
          enabled:         String(updates['exp_stage_mod_enabled']        ?? expOld['exp_stage_mod_enabled'])        === '1',
          manual_suspense: String(updates['exp_stage_mod_manual_suspense'] ?? expOld['exp_stage_mod_manual_suspense']) === '1',
        }));
      }

      // Stage Mod — Transition Adjustments: log only the fields that actually changed
      const changedTransitions = {};
      if ('exp_transition_card_delay'     in updates && String(updates['exp_transition_card_delay'])     !== expOld['exp_transition_card_delay'])     changedTransitions.card_delay    = String(updates['exp_transition_card_delay']);
      if ('exp_transition_round_timeout'  in updates && String(updates['exp_transition_round_timeout'])  !== expOld['exp_transition_round_timeout'])  changedTransitions.round_timeout = String(updates['exp_transition_round_timeout']);
      if ('exp_transition_suspense_delay' in updates && String(updates['exp_transition_suspense_delay']) !== expOld['exp_transition_suspense_delay']) changedTransitions.suspense_delay = String(updates['exp_transition_suspense_delay']);
      if (Object.keys(changedTransitions).length > 0) {
        expAudit.run('stage_mod_transitions_changed', JSON.stringify({
          enabled: String(updates['exp_stage_mod_enabled'] ?? expOld['exp_stage_mod_enabled']) === '1',
          changed: changedTransitions,
        }));
      }

      // Font Family — Header: log if master toggle or header font changed
      if (('exp_font_enabled'    in updates && String(updates['exp_font_enabled'])    !== expOld['exp_font_enabled'])
       || ('exp_font_header_id'  in updates && String(updates['exp_font_header_id'])  !== expOld['exp_font_header_id'])) {
        const newHeaderId = updates['exp_font_header_id'] ?? expOld['exp_font_header_id'];
        let headerName = 'Orbitron (Default)';
        if (newHeaderId && newHeaderId !== 'default') {
          const font = db.prepare('SELECT display_name FROM fonts WHERE id = ?').get(newHeaderId);
          if (font) headerName = font.display_name;
        }
        expAudit.run('font_header_changed', JSON.stringify({
          enabled:   String(updates['exp_font_enabled'] ?? expOld['exp_font_enabled']) === '1',
          font_name: headerName,
        }));
      }

      // Font Family — Body: log if master toggle or body font changed
      if (('exp_font_enabled'  in updates && String(updates['exp_font_enabled'])  !== expOld['exp_font_enabled'])
       || ('exp_font_body_id'  in updates && String(updates['exp_font_body_id'])  !== expOld['exp_font_body_id'])) {
        const newBodyId = updates['exp_font_body_id'] ?? expOld['exp_font_body_id'];
        let bodyName = 'Rajdhani (Default)';
        if (newBodyId && newBodyId !== 'default') {
          const font = db.prepare('SELECT display_name FROM fonts WHERE id = ?').get(newBodyId);
          if (font) bodyName = font.display_name;
        }
        expAudit.run('font_body_changed', JSON.stringify({
          enabled:   String(updates['exp_font_enabled'] ?? expOld['exp_font_enabled']) === '1',
          font_name: bodyName,
        }));
      }
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

      // Audit log
      const oldFilename = (oldLogo && oldLogo.value) ? oldLogo.value : 'None';
      db.prepare('INSERT INTO audit_home_changes (field, old_value, new_value) VALUES (?, ?, ?)').run(
        'Logo',
        sanitizeAuditInput(oldFilename),
        sanitizeAuditInput(req.file.originalname)
      );

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

    const uploadsDir = path.resolve(__dirname, '..', 'uploads');
    const logoPath = path.resolve(uploadsDir, path.basename(row.value));
    if (!logoPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (!fs.existsSync(logoPath)) {
      return res.status(404).json({ error: 'Logo file not found' });
    }

    res.sendFile(logoPath);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = router;
