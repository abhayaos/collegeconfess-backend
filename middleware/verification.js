const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv/config');

async function requireVerified(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (decoded.role === 'admin') {
      return next();
    }

    const user = await User.findOne({ username: decoded.id });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.verificationStatus !== 'verified') {
      return res.status(403).json({
        message: 'Your account is not verified yet. Please wait for admin approval.',
        verificationStatus: user.verificationStatus,
      });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { requireVerified };
