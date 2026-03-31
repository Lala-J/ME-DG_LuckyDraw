const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set');
}

// preventing cookie shadowing from subdomains or non-HTTPS contexts.
const ADMIN_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Host-admin_token'
  : 'admin_token';

function authMiddleware(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // Reject tokens that were not issued as admin session tokens.
    // Prevent Azure tokens from being validated as admin tokens.
    if (decoded.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
module.exports.ADMIN_COOKIE_NAME = ADMIN_COOKIE_NAME;
