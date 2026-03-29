const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { charSimilarity, normalizePhone } = require('./registration');

// ---------------------------------------------------------------------------
// Microsoft Graph API OAuth 2.0 Authorization Code Flow
//
// All Graph API calls and token exchanges happen SERVER-SIDE only.
// No access tokens, user profile data, or raw API responses are ever sent
// to the client. Only an opaque short-lived result token (success / error
// code) is passed back, via a signed JWT that the frontend redeems once.
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const REDIRECT_URI = process.env.AZURE_REDIRECT_URI;

// In-memory OAuth state store  { state -> { expires: timestamp } }
// Prevents CSRF on the callback.
const pendingStates = new Map();

// In-memory set of consumed result-token JTIs (one-time-use enforcement)
const usedJtis = new Set();

// Periodic cleanup of expired states
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (val.expires < now) pendingStates.delete(key);
  }
}, 60 * 1000);

// Periodic trim of JTI set (tokens expire in 60 s, trim every 5 min)
setInterval(() => {
  if (usedJtis.size > 5000) usedJtis.clear();
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const postData = body;
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpsGet(hostname, path, bearerToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${bearerToken}` }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Serialised write queue (mirrors the one in registration.js — each is
// independently atomic because registration_table has a UNIQUE constraint
// on staff_id, so a race condition would simply produce a constraint error).
let writeQueue = Promise.resolve();
function serializeWrite(fn) {
  const result = writeQueue.then(fn).catch((err) => { throw err; });
  writeQueue = result.catch(() => {});
  return result;
}

// Build the opaque result redirect token
function makeResultToken(result) {
  return jwt.sign(
    { r: result, jti: crypto.randomBytes(8).toString('hex') },
    JWT_SECRET,
    { expiresIn: '60s' }
  );
}

// ---------------------------------------------------------------------------
// GET /api/auth/microsoft/login
// Initiates the OAuth flow by redirecting the browser to Microsoft.
// ---------------------------------------------------------------------------
router.get('/microsoft/login', (_req, res) => {
  if (!CLIENT_ID || !TENANT_ID || !REDIRECT_URI || !CLIENT_SECRET) {
    // MS Graph not configured — redirect back with a 501 result token
    return res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken('err501'))}`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { expires: Date.now() + 10 * 60 * 1000 }); // 10-min TTL

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'User.Read',
    state,
    response_mode: 'query'
  });

  res.redirect(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`);
});

// ---------------------------------------------------------------------------
// GET /api/auth/microsoft/callback
// Microsoft redirects here after the user authenticates.
// All sensitive work happens here, server-side.
// ---------------------------------------------------------------------------
router.get('/microsoft/callback', async (_req, res) => {
  const req = _req; // used below

  try {
    const { code, state, error } = req.query;

    if (error || !code || !state) {
      return res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken('err501'))}`);
    }

    // CSRF: validate state
    const stateEntry = pendingStates.get(state);
    if (!stateEntry || stateEntry.expires < Date.now()) {
      pendingStates.delete(state);
      return res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken('err501'))}`);
    }
    pendingStates.delete(state);

    // Exchange authorisation code for access token (server-to-server)
    const tokenBody = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: 'User.Read'
    }).toString();

    const tokenRes = await httpsPost(
      'login.microsoftonline.com',
      `/${TENANT_ID}/oauth2/v2.0/token`,
      tokenBody
    );

    if (tokenRes.status !== 200 || !tokenRes.body.access_token) {
      return res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken('err501'))}`);
    }

    const accessToken = tokenRes.body.access_token;

    // Fetch user profile from Microsoft Graph API (server-to-server).
    // ---------------------------------------------------------------
    // Fields retrieved:
    //   displayName  — used as the user's Full Name for name-similarity check
    //   mobilePhone  — used as the user's Phone Number for exact match
    //
    // To change which Graph fields are used, update the $select query below
    // AND update the variable assignments immediately after the API call.
    // ---------------------------------------------------------------
    const profileRes = await httpsGet(
      'graph.microsoft.com',
      '/v1.0/me?$select=displayName,mobilePhone',
      accessToken
    );

    // Access token is no longer needed; do NOT forward it anywhere
    if (profileRes.status !== 200) {
      return res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken('err501'))}`);
    }

    // ---------------------------------------------------------------
    // FIELD MAPPING — adjust these two lines if your Graph fields differ
    const graphFullName = profileRes.body.displayName;   // Graph field → Full Name
    const graphPhone    = profileRes.body.mobilePhone;   // Graph field → Phone Number
    // ---------------------------------------------------------------

    if (!graphFullName || !graphPhone) {
      // Profile incomplete — cannot validate
      return res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken('err406'))}`);
    }

    // Validate & register (serialised to prevent race conditions)
    const outcome = await serializeWrite(() => {
      const db = getDb();

      // Check registration window
      const openRow = db.prepare("SELECT value FROM config WHERE key = 'registration_open'").get();
      if (!openRow || openRow.value !== '1') return 'err406';

      const endRow = db.prepare("SELECT value FROM config WHERE key = 'registration_end_time'").get();
      if (endRow && endRow.value) {
        const endTime = new Date(endRow.value);
        if (!isNaN(endTime.getTime()) && new Date() > endTime) {
          db.prepare("INSERT INTO config (key, value) VALUES ('registration_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
          return 'err406';
        }
      }

      // Phone number: 100% match (normalised — digits only)
      const inputPhone = normalizePhone(graphPhone);
      const allRows = db.prepare('SELECT * FROM validation_table').all();
      const validationRow = allRows.find(r => normalizePhone(r.phone_number) === inputPhone);
      if (!validationRow) return 'err406';

      // Full name: ≥85% character-frequency similarity
      if (charSimilarity(graphFullName, validationRow.full_name) < 0.85) return 'err406';

      // Duplicate check
      const existing = db.prepare('SELECT id FROM registration_table WHERE staff_id = ?').get(validationRow.staff_id);
      if (existing) return 'err406';

      // Register — store data from validation_table, never from Graph API
      db.prepare('INSERT INTO registration_table (full_name, staff_id, phone_number) VALUES (?, ?, ?)').run(
        validationRow.full_name,
        validationRow.staff_id,
        validationRow.phone_number
      );

      return 'success';
    });

    // Redirect back to the frontend with an opaque, short-lived result token.
    // The token contains only 'success' or an error code string — no user data.
    res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken(outcome))}`);

  } catch (err) {
    console.error('[auth] Microsoft callback error:', err.message || 'unknown');
    // Never expose internal error details
    res.redirect(`/registration?authResult=${encodeURIComponent(makeResultToken('err501'))}`);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/microsoft/verify
// Frontend submits the opaque result token here to learn the outcome.
// Returns only: { success: boolean, errorCode?: number }
// ---------------------------------------------------------------------------
router.post('/microsoft/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, errorCode: 400 });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { r: result, jti } = decoded;

    // One-time-use enforcement
    if (usedJtis.has(jti)) {
      return res.status(400).json({ success: false, errorCode: 400 });
    }
    usedJtis.add(jti);

    if (result === 'success') return res.json({ success: true });
    if (result === 'err406') return res.json({ success: false, errorCode: 406 });
    return res.json({ success: false, errorCode: 501 });

  } catch (_) {
    // Expired, tampered, or otherwise invalid token
    return res.status(400).json({ success: false, errorCode: 400 });
  }
});

module.exports = router;