const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Confession = require('../models/Confession');
const Log = require('../models/Log');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');
require('dotenv/config');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

const emojis = [
  '😶','🙂','😎','🫠','🥸','🤓','💤','🌚','👀','🐼','🐸','🐱','🦊','🐧','🦥',
  '🤡','💀','🗿','👽','🤖','👹','👺','🥴','🤠','😵‍💫','🫥','🐔','🍕','🥔','🧃',
  '🕶️','🎭','🌑','🖤','☠️','👤','🐺','🔥','⚡','🩸','🪬','🧠','🫣','🥀','🕳️',
  '🌸','☁️','🌙','⭐','🦋','🍓','🎧','📚','🪐','🌊','🍄','🧸','🎀','🪻','🌷',
  '📉','☕','😭','🤯','🧠','💤','🍜','🧍','🫡','🧃','💔','🧨','⏰',
  '🎭🖤','🌚☕','🐼💤','👀🔥','💀📚','🥀🌙','🤡🎧','🫣🖤','🐸☕','👽🛸',
];

function randomEmoji() {
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function generateTokens(user) {
  const payload = { id: user.username, role: user.role, name: user.name, tokenVersion: user.tokenVersion };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

const isDev = !process.env.FLY_APP_NAME && (!process.env.NODE_ENV || process.env.NODE_ENV === 'development');
const cookieOptions = {
  httpOnly: true,
  secure: !isDev,
  sameSite: isDev ? 'lax' : 'none',
  path: '/',
};

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function setAccessCookie(res, token) {
  res.cookie('accessToken', token, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
}

function clearCookies(res) {
  res.clearCookie('accessToken', { ...cookieOptions });
  res.clearCookie('refreshToken', { ...cookieOptions });
}

function userData(user) {
  if (!user.avatar) {
    user.avatar = randomEmoji();
    user.save();
  }
  return {
    id: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    authProvider: user.authProvider,
    verificationStatus: user.verificationStatus,
    gender: user.gender,
    collegeId: user.collegeId,
    hasPassword: !!user.password,
    avatar: user.avatar,
    premium: user.premium,
  };
}

router.post('/set-password', rateLimiter, authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ username: req.user.id });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.authProvider === 'local' && user.password) {
      return res.status(400).json({ message: 'You already have a password set' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password set successfully', hasPassword: true });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/admin/set-password/:username', rateLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    await Log.create({
      action: 'set-password',
      target: 'user',
      targetId: user.username,
      adminId: req.user.id,
      details: `Admin set password for user ${user.username}`,
    });

    res.json({ message: 'Password set successfully' });
  } catch (err) {
    console.error('Admin set password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

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
        avatar: randomEmoji(),
      });
    }

    if (email === 'abhayabikramshahiofficial@gmail.com' || email === 'stnjro@gmail.com') {
      user.role = 'admin';
      await user.save();
    }

    const { accessToken, refreshToken } = generateTokens(user);
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);

    const uData = userData(user);

    if (!user.gender) {
      return res.json({ token: accessToken, refreshToken, user: uData, onboarding: true });
    }

    return res.json({ token: accessToken, refreshToken, user: uData, onboarding: false });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ message: 'Invalid Google credential' });
  }
});

router.get('/discord/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=no_code`);
    }

    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: DISCORD_REDIRECT_URI,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token } = tokenResponse.data;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id: discordId, global_name, username: discordUsername } = userResponse.data;

    let user = await User.findOne({ discordId });

    if (user) {
      const { accessToken, refreshToken } = generateTokens(user);
      setRefreshCookie(res, refreshToken);
      setAccessCookie(res, accessToken);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?login=success`);
    }

    const baseUsername = discordUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;
    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    user = await User.create({
      username,
      discordId,
      name: global_name || discordUsername || 'Discord User',
      authProvider: 'discord',
      verificationStatus: 'pending',
      avatar: randomEmoji(),
    });

    const { accessToken, refreshToken } = generateTokens(user);
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);

    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/onboard`);
  } catch (err) {
    console.error('Discord auth error:', err);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=discord_auth_failed`);
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

    const { accessToken, refreshToken } = generateTokens(user);
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);

    res.json({ token: accessToken, refreshToken, user: userData(user) });
  } catch (err) {
    console.error('Onboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/register', rateLimiter, async (req, res) => {
  try {
    const { username, password, name, email } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ message: 'Username, password, and name are required' });
    }
    const cleaned = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleaned.length < 3 || cleaned.length > 30) {
      return res.status(400).json({ message: 'Username must be 3-30 alphanumeric characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (name.length > 100) {
      return res.status(400).json({ message: 'Name too long' });
    }

    const existing = await User.findOne({ username: cleaned });
    if (existing) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    if (email) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(409).json({ message: 'Email already registered' });
      }
    }

    const user = await User.create({
      username: cleaned,
      password,
      name: name.trim(),
      email: email ? email.toLowerCase() : undefined,
      authProvider: 'local',
      verificationStatus: 'pending',
      avatar: randomEmoji(),
    });

    if (user.email && (user.email === 'abhayabikramshahiofficial@gmail.com' || user.email === 'stnjro@gmail.com')) {
      user.role = 'admin';
      await user.save();
    }

    const { accessToken, refreshToken } = generateTokens(user);
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);

    res.status(201).json({ token: accessToken, refreshToken, user: userData(user) });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', rateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: username.toLowerCase() },
      ],
    });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.email && (user.email === 'abhayabikramshahiofficial@gmail.com' || user.email === 'stnjro@gmail.com')) {
      if (user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
      }
    }

    const { accessToken, refreshToken } = generateTokens(user);
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);
    return res.json({ token: accessToken, refreshToken, user: userData(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/refresh', rateLimiter, async (req, res) => {
  let token = req.cookies?.refreshToken;
  if (!token && req.body?.refreshToken) {
    token = req.body.refreshToken;
  }
  if (!token) {
    return res.json({ user: null });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.json({ user: null });
    }
    const user = await User.findOne({ username: decoded.id });
    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ message: 'Token revoked, please login again' });
    }
    const tokens = generateTokens(user);
    setRefreshCookie(res, tokens.refreshToken);
    setAccessCookie(res, tokens.accessToken);
    return res.json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: userData(user),
      needsOnboarding: !user.gender,
      collegeId: user.collegeId,
    });
  } catch {
    return res.json({ user: null });
  }
});

router.post('/logout', rateLimiter, async (req, res) => {
  const token = req.cookies?.accessToken;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      await User.updateOne({ username: decoded.id }, { $inc: { tokenVersion: 1 } });
    } catch {
    }
  }
  clearCookies(res);
  return res.json({ message: 'Logged out' });
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.id }).select('-password -idCard');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(userData(user));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/user/:username', rateLimiter, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('username name role verificationStatus gender createdAt collegeId avatar');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const uData = userData(user);
    res.json({ id: uData.id, name: uData.name, role: uData.role, verificationStatus: uData.verificationStatus, gender: uData.gender, createdAt: user.createdAt, collegeId: uData.collegeId, avatar: uData.avatar });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/me', rateLimiter, authenticate, async (req, res) => {
  try {
    const { name, gender, username } = req.body;
    const user = await User.findOne({ username: req.user.id });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (name) {
      if (name.length > 100) return res.status(400).json({ message: 'Name too long' });
      user.name = name.trim();
    }
    if (gender) {
      if (!['male', 'female', 'other'].includes(gender)) return res.status(400).json({ message: 'Invalid gender' });
      user.gender = gender;
    }
    if (username && username.toLowerCase() !== req.user.id) {
      const newUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (newUsername.length < 3 || newUsername.length > 30) {
        return res.status(400).json({ message: 'Username must be 3-30 characters' });
      }
      const existing = await User.findOne({ username: newUsername });
      if (existing) {
        return res.status(409).json({ message: 'Username already taken' });
      }
      user.username = newUsername;
    }
    await user.save();
    const tokens = generateTokens(user);
    setAccessCookie(res, tokens.accessToken);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ token: tokens.accessToken, refreshToken: tokens.refreshToken, user: userData(user) });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/users', rateLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password -idCard');
    res.json(users.map(u => userData(u)));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users', rateLimiter, authenticate, requireAdmin, async (req, res) => {
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
      avatar: randomEmoji(),
    });

    await Log.create({ action: 'create-user', target: 'user', targetId: username.toLowerCase(), adminId: req.user.id, details: `Created user ${username}` });
    req.app.get('io')?.emit('users-changed', { action: 'create', username: user.username });
    res.status(201).json({ id: user.username, name: user.name, collegeId: user.collegeId, role: user.role });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/users/:username', rateLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const { collegeId, premium } = req.body;
    const username = req.params.username.toLowerCase();

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (collegeId !== undefined) {
      user.collegeId = collegeId ? collegeId.toUpperCase() : undefined;
    }
    if (premium !== undefined) {
      user.premium = premium;
    }
    await user.save();

    const details = [];
    if (collegeId !== undefined) details.push(`collegeId → ${collegeId || 'none'}`);
    if (premium !== undefined) details.push(`premium → ${premium}`);
    await Log.create({ action: 'update-user', target: 'user', targetId: username, adminId: req.user.id, details: details.join(', ') || 'No changes' });
    req.app.get('io')?.emit('users-changed', { action: 'update', username });
    res.json({ id: user.username, name: user.name, collegeId: user.collegeId, premium: user.premium });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/me', rateLimiter, authenticate, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(400).json({ message: 'Admin accounts cannot be deleted via this endpoint' });
    }
    const deleted = await User.findOneAndDelete({ username: req.user.id });
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }
    await Confession.deleteMany({ userId: req.user.id });
    clearCookies(res);
    return res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/users/:username', rateLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const deleted = await User.findOneAndDelete({ username });
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }
    await Log.create({ action: 'delete-user', target: 'user', targetId: username, adminId: req.user.id, details: `Deleted user ${username}` });
    req.app.get('io')?.emit('users-changed', { action: 'delete', username });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/verify-users', rateLimiter, authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({
      verificationStatus: { $in: ['pending', 'verified', 'rejected'] },
    }).select('-password').sort({ createdAt: -1 });
    res.json(users.map(u => ({ ...userData(u), username: u.username, idCard: u.idCard })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/verify-user/:id', rateLimiter, authenticate, requireAdmin, async (req, res) => {
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

    req.app.get('io')?.emit('user-verified', { username: user.username, status });
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
