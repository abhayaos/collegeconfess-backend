const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv/config');

async function authenticate(req, res, next) {
  let token = req.cookies?.accessToken;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin' && decoded.tokenVersion !== undefined) {
      const user = await User.findOne({ username: decoded.id });
      if (!user || user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({ message: 'Token revoked, please login again' });
      }
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
