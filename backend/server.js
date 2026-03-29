require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
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

  app.use(helmet());

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000'];
  app.use(cors({ origin: allowedOrigins }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // All employees share a single corporate NAT IP, so this limit must account
  // for the entire employee pool submitting at once (up to ~600/hr peak).
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

  // Global error handler — never expose stack traces in production
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
