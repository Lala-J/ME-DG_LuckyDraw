require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./db');

const isDev = process.env.NODE_ENV !== 'production';

async function startServer() {
  await initDatabase();

  const configRoutes = require('./routes/config');
  const { registrationRouter, validationRouter } = require('./routes/registration');
  const adminRoutes = require('./routes/admin');
  const luckyDrawRoutes = require('./routes/luckydraw');
  const prizeRoutes = require('./routes/prizes');
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

  app.use('/api/config', configRoutes);
  app.post('/api/admin/login', adminLoginLimiter);
  app.use('/api/admin', adminRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/luckydraw', luckyDrawRoutes);
  app.use('/api/prizes', prizeRoutes);

  app.post('/api/registration', registrationLimiter);
  app.use('/api/registration', registrationRouter);
  app.use('/api/validation', validationRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
