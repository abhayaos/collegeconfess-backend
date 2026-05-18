const express = require('express');
const Room = require('../models/Room');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { roomId, name, description } = req.body;
    
    if (!roomId || !name) {
      return res.status(400).json({ message: 'Room ID and name are required' });
    }

    if (roomId.length !== 6) {
      return res.status(400).json({ message: 'Room ID must be 6 characters' });
    }

    const existing = await Room.findOne({ roomId: roomId.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: 'Room ID already exists' });
    }

    const room = await Room.create({
      roomId: roomId.toUpperCase(),
      name,
      description,
    });
    res.status(201).json(room);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Room.findByIdAndDelete(req.params.id);
    res.json({ message: 'Room deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;