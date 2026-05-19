const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Log = require('../models/Log');
require('dotenv/config');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password, collegeId } = req.body;
  
  const adminUsername = 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (username === adminUsername && password === adminPassword) {
    const token = jwt.sign(
      { id: 'admin', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: { id: 'admin', name: 'Admin', role: 'admin' } });
  }
  
  const user = await User.findOne({ username: username.toLowerCase() });
  if (user && user.password === password) {
    if (user.collegeId && user.collegeId !== collegeId?.toUpperCase()) {
      return res.status(401).json({ message: 'College ID does not match' });
    }
    const token = jwt.sign(
      { id: user.username, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: { id: user.username, name: user.name, collegeId: user.collegeId, role: user.role } });
  }
  
  res.status(401).json({ message: 'Invalid credentials' });
});

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { username, password, name, collegeId } = req.body;
    
    if (!username || !password || !name) {
      return res.status(400).json({ message: 'All fields are required' });
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
      role: 'user'
    });
    
    await Log.create({ action: 'create-user', target: 'user', targetId: username.toLowerCase(), adminId: 'admin', details: `Created user ${username}` });
    res.status(201).json({ id: user.username, name: user.name, collegeId: user.collegeId, role: user.role });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/users/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    await User.findOneAndDelete({ username });
    await Log.create({ action: 'delete-user', target: 'user', targetId: username, adminId: 'admin', details: `Deleted user ${username}` });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;