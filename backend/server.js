require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const https = require('https');
const rateLimit = require('express-rate-limit');
const { initDatabase, getDb } = require('./db');
const { broadcastStatusChange } = require('./events');

const isDev = process.env.NODE_ENV !== 'production';

// ── System status helpers ─────────────────────────────────────────────────────
const SERVER_START_TIME = new Date();
let _azureCache = null; // { connected, orgName, checkedAt }

function _httpsPostForm(hostname, urlPath, formBody) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formBody),
      },
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
    req.write(formBody);
    req.end();
  });
}

function _httpsGetBearer(hostname, urlPath, bearerToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: urlPath,
      method: 'GET',
      headers: { Authorization: `Bearer ${bearerToken}` },
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

async function checkAzureConnectivity() {
  const now = Date.now();
  if (_azureCache && now - _azureCache.checkedAt < 5 * 60 * 1000) {
    return _azureCache;
  }
  const CLIENT_ID     = process.env.AZURE_CLIENT_ID;
  const TENANT_ID     = process.env.AZURE_TENANT_ID;
  const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

  if (!CLIENT_ID || !TENANT_ID || !CLIENT_SECRET) {
    _azureCache = { connected: false, orgName: null, checkedAt: now };
    return _azureCache;
  }
  try {
    const formBody = [
      `client_id=${encodeURIComponent(CLIENT_ID)}`,
      `client_secret=${encodeURIComponent(CLIENT_SECRET)}`,
      `scope=${encodeURIComponent('https://graph.microsoft.com/.default')}`,
      'grant_type=client_credentials',
    ].join('&');

    const tokenRes = await _httpsPostForm(
      'login.microsoftonline.com',
      `/${TENANT_ID}/oauth2/v2.0/token`,
      formBody
    );
    if (!tokenRes.body.access_token) {
      _azureCache = { connected: false, orgName: null, checkedAt: now };
      return _azureCache;
    }

    const orgRes = await _httpsGetBearer(
      'graph.microsoft.com',
      '/v1.0/organization?$select=displayName',
      tokenRes.body.access_token
    );
    const orgName = orgRes.body?.value?.[0]?.displayName || null;
    _azureCache = { connected: true, orgName, checkedAt: now };
    return _azureCache;
  } catch {
    _azureCache = { connected: false, orgName: null, checkedAt: now };
    return _azureCache;
  }
}

async function startServer() {
  await initDatabase();

  const configRoutes = require('./routes/config');
  const { registrationRouter, validationRouter } = require('./routes/registration');
  const adminRoutes = require('./routes/admin');
  const luckyDrawRoutes = require('./routes/luckydraw');
  const prizeRoutes = require('./routes/prizes');
  const fontRoutes = require('./routes/fonts');
  const authRoutes = require('./routes/auth');

  const app = express();
  const PORT = process.env.PORT || 4000;

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000'];

  // Security policy enforcement — set DEFAULT_SECURITY_POLICY=false to bypass (not recommended)
  const securityPolicy = process.env.DEFAULT_SECURITY_POLICY !== 'false';

  if (securityPolicy && !isDev) {
    const insecureOrigins = allowedOrigins.filter(
      o => !o.startsWith('https://') && !o.includes('localhost') && !o.includes('127.0.0.1')
    );
    if (insecureOrigins.length > 0) {
      console.error('[SECURITY] DEFAULT_SECURITY_POLICY is enabled but the following ALLOWED_ORIGINS use HTTP:');
      console.error('  ' + insecureOrigins.join(', '));
      console.error('  Enforce HTTPS on your reverse proxy or set DEFAULT_SECURITY_POLICY=false to bypass.');
      process.exit(1);
    }
    const azureRedirect = process.env.AZURE_REDIRECT_URI;
    if (azureRedirect && !azureRedirect.startsWith('https://')) {
      console.error('[SECURITY] DEFAULT_SECURITY_POLICY is enabled but AZURE_REDIRECT_URI uses HTTP: ' + azureRedirect);
      console.error('  Update AZURE_REDIRECT_URI to use https:// or set DEFAULT_SECURITY_POLICY=false to bypass.');
      process.exit(1);
    }
  }

  app.use(helmet({
    hsts: securityPolicy ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  }));

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(cookieParser());

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const registrationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    message: { success: false, message: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  // Prevents rapid token harvesting from the OAuth error path.
  const oauthCallbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  // Limits concurrent SSE stream connections per IP — each client only needs one.
  const registrationStatusStreamLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: { error: 'Too many status stream requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api/config', configRoutes);
  app.use('/api/fonts', fontRoutes);
  app.post('/api/admin/login', adminLoginLimiter);
  app.use('/api/admin', adminRoutes);
  app.use('/api/auth/microsoft/login', oauthCallbackLimiter);
  app.use('/api/auth/microsoft/callback', oauthCallbackLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/luckydraw', luckyDrawRoutes);
  app.use('/api/prizes', prizeRoutes);

  app.post('/api/registration', registrationLimiter);
  app.get('/api/registration/status/stream', registrationStatusStreamLimiter);
  app.use('/api/registration', registrationRouter);
  app.use('/api/validation', validationRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const authMiddleware = require('./middleware/auth');
  app.get('/api/system-status', authMiddleware, async (_req, res) => {
    const azure = await checkAzureConnectivity();
    res.json({
      startTime: SERVER_START_TIME.toISOString(),
      azure: { connected: azure.connected, orgName: azure.orgName },
    });
  });

  // Global error handler
  // Express requires all 4 params to recognise this as an error handler
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({
      error: isDev ? err.message : 'Internal server error'
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lucky Draw backend running on http://localhost:${PORT}`);
  });
}

// Server-side registration expiry watcher.
// Checks every second whether the registration end time has passed.
// When it has, closes registration in the DB and pushes an instant SSE update
// to all connected clients without waiting for a client poll.
setInterval(() => {
  try {
    const db = getDb();
    const openRow = db.prepare("SELECT value FROM config WHERE key = 'registration_open'").get();
    if (!openRow || openRow.value !== '1') return;
    const endRow = db.prepare("SELECT value FROM config WHERE key = 'registration_end_time'").get();
    if (!endRow || !endRow.value) return;
    const end = new Date(endRow.value);
    if (!isNaN(end.getTime()) && new Date() > end) {
      db.prepare("INSERT INTO config (key, value) VALUES ('registration_open', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
      broadcastStatusChange({ open: false, endTime: null });
    }
  } catch (_) {}
}, 1000);

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
