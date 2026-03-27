require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./db');

async function startServer() {
  await initDatabase();

  const configRoutes = require('./routes/config');
  const { registrationRouter, validationRouter } = require('./routes/registration');
  const adminRoutes = require('./routes/admin');
  const luckyDrawRoutes = require('./routes/luckydraw');

  const app = express();
  const PORT = process.env.PORT || 4000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  const registrationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many registration attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api/config', configRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/luckydraw', luckyDrawRoutes);

  app.post('/api/registration', registrationLimiter);
  app.use('/api/registration', registrationRouter);
  app.use('/api/validation', validationRouter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lucky Draw backend running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
