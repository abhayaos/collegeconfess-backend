const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Log = require('../models/Log');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');
require('dotenv/config');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function generateToken(user) {
  return jwt.sign(
    { id: user.username, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/google', rateLimiter, async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' });
    }
    if (!googleClient) {
      return res.status(500).json({ message: 'Google auth not configured' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: googleName } = payload;

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    } else {
      const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      let username = baseUsername;
      let counter = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      user = await User.create({
        username,
        googleId,
        email,
        name: googleName || 'User',
        authProvider: 'google',
        verificationStatus: 'pending',
      });
    }

    const token = generateToken(user);

    if (!user.gender) {
      return res.json({
        token,
        user: {
          id: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          authProvider: user.authProvider,
          verificationStatus: user.verificationStatus,
        },
        onboarding: true,
      });
    }

    res.json({
      token,
      user: {
        id: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        verificationStatus: user.verificationStatus,
      },
      onboarding: false,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ message: 'Invalid Google credential' });
  }
});

router.post('/onboard', rateLimiter, authenticate, async (req, res) => {
  try {
    const { name, gender, idCard } = req.body;
    if (!name || !gender) {
      return res.status(400).json({ message: 'Name and gender are required' });
    }
    if (!['male', 'female', 'other'].includes(gender)) {
      return res.status(400).json({ message: 'Invalid gender value' });
    }
    if (name.length > 100) {
      return res.status(400).json({ message: 'Name too long' });
    }
    if (idCard && idCard.length > 5000000) {
      return res.status(400).json({ message: 'ID card image too large' });
    }

    const user = await User.findOne({ username: req.user.id });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name.trim();
    user.gender = gender;
    if (idCard) {
      user.idCard = idCard;
    }
    user.verificationStatus = 'pending';
    await user.save();

    const newToken = generateToken(user);

    res.json({
      token: newToken,
      user: {
        id: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        verificationStatus: user.verificationStatus,
      },
    });
  } catch (err) {
    console.error('Onboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', rateLimiter, async (req, res) => {
  try {
    const { username, password, collegeId } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const adminUsername = 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ message: 'Server configuration error' });
    }

    if (username === adminUsername) {
      if (password === adminPassword) {
        const token = jwt.sign(
          { id: 'admin', role: 'admin' },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        return res.json({ token, user: { id: 'admin', name: 'Admin', role: 'admin' } });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.collegeId && user.collegeId !== collegeId?.toUpperCase()) {
      return res.status(401).json({ message: 'College ID does not match' });
    }

    const token = jwt.sign(
      { id: user.username, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: user.username,
        name: user.name,
        collegeId: user.collegeId,
        role: user.role,
        authProvider: user.authProvider,
        verificationStatus: user.verificationStatus,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.id }).select('-password -idCard');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      id: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      authProvider: user.authProvider,
      verificationStatus: user.verificationStatus,
      gender: user.gender,
      collegeId: user.collegeId,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password -idCard');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, name, collegeId } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const user = await User.create({
      username: username.toLowerCase(),
      password,
      name,
      collegeId: collegeId ? collegeId.toUpperCase() : undefined,
      role: 'user',
    });

    await Log.create({ action: 'create-user', target: 'user', targetId: username.toLowerCase(), adminId: req.user.id, details: `Created user ${username}` });
    res.status(201).json({ id: user.username, name: user.name, collegeId: user.collegeId, role: user.role });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/users/:username', authenticate, requireAdmin, async (req, res) => {
  try {
    const { collegeId } = req.body;
    const username = req.params.username.toLowerCase();

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.collegeId = collegeId ? collegeId.toUpperCase() : undefined;
    await user.save();

    await Log.create({ action: 'update-user', target: 'user', targetId: username, adminId: req.user.id, details: `Updated collegeId for user ${username} to ${collegeId || 'none'}` });
    res.json({ id: user.username, name: user.name, collegeId: user.collegeId });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/users/:username', authenticate, requireAdmin, async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const deleted = await User.findOneAndDelete({ username });
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }
    await Log.create({ action: 'delete-user', target: 'user', targetId: username, adminId: req.user.id, details: `Deleted user ${username}` });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/verify-users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({
      verificationStatus: { $in: ['pending', 'verified', 'rejected'] },
    }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/verify-user/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be verified or rejected' });
    }

    const user = await User.findOne({ username: req.params.id.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.verificationStatus = status;
    await user.save();

    await Log.create({
      action: 'verify-user',
      target: 'user',
      targetId: user.username,
      adminId: req.user.id,
      details: `${status === 'verified' ? 'Approved' : 'Rejected'} verification for user ${user.username}`,
    });

    res.json({
      id: user.username,
      name: user.name,
      verificationStatus: user.verificationStatus,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
