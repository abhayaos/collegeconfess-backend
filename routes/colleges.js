const express = require('express');
const College = require('../models/College');
const Log = require('../models/Log');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const colleges = await College.find().sort({ createdAt: -1 });
    res.json(colleges);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { collegeId, name, description } = req.body;
    
    if (!collegeId || collegeId.length !== 6) {
      return res.status(400).json({ message: 'College ID must be 6 characters' });
    }
    if (!name) {
      return res.status(400).json({ message: 'College name is required' });
    }

    const existing = await College.findOne({
      $or: [
        { collegeId: collegeId.toUpperCase() },
        { name: name.toLowerCase() }
      ]
    });
    if (existing) {
      return res.status(400).json({ message: 'College ID or name already exists' });
    }

    const college = await College.create({
      collegeId: collegeId.toUpperCase(),
      name: name.toLowerCase(),
      description,
    });
    await Log.create({ action: 'create-college', target: 'college', targetId: collegeId.toUpperCase(), adminId: 'admin', details: `Created college ${name} (${collegeId.toUpperCase()})` });
    res.status(201).json(college);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const college = await College.findByIdAndDelete(req.params.id);
    if (college) {
      await Log.create({ action: 'delete-college', target: 'college', targetId: college.collegeId, adminId: 'admin', details: `Deleted college ${college.name} (${college.collegeId})` });
    }
    res.json({ message: 'College deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;