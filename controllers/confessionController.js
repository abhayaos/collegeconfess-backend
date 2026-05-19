const crypto = require('crypto');
const Confession = require('../models/Confession');
const Notification = require('../models/Notification');
const Log = require('../models/Log');
const profanityFilter = require('../middleware/profanityFilter');

function generateShortId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function getUniqueShortId() {
  let id;
  let exists = true;
  while (exists) {
    id = generateShortId();
    exists = await Confession.findOne({ shortId: id });
  }
  return id;
}

const animals = [
  'Tiger', 'Panda', 'Lion', 'Eagle', 'Fox', 'Wolf', 'Bear',
  'Deer', 'Owl', 'Dolphin', 'Phoenix', 'Dragon', 'Falcon', 'Panther',
];

function randomName() {
  const a = animals[Math.floor(Math.random() * animals.length)];
  return `Anonymous ${a}`;
}

function hashIP(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

exports.create = async (req, res) => {
  try {
    let { text, category, title, collegeId } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Text is required' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    text = profanityFilter(text.trim());
    const ipHash = hashIP(req.ip);
    const recent = await Confession.findOne({ ipHash })
      .sort({ createdAt: -1 });
    if (recent && Date.now() - new Date(recent.createdAt).getTime() < 30000) {
      return res.status(429).json({ message: 'Please wait 30 seconds before posting again' });
    }

    // Validate category against allowed values
    const allowedCategories = ['love', 'crush', 'study', 'academic', 'friendship', 'rant', 'secret'];
    if (category && !allowedCategories.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    const confession = await Confession.create({
      shortId: await getUniqueShortId(),
      title: title.trim().slice(0, 100),
      text,
      category: category || 'love',
      anonymousName: randomName(),
      collegeId: collegeId ? collegeId.toLowerCase() : null,
      userId: req.body.userId || null,
      ipHash,
    });
    
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.emit('new-confession', confession);
      if (collegeId) {
        io.to(collegeId.toLowerCase()).emit('new-confession', confession);
      }
    }
    
    res.status(201).json(confession);
  } catch (err) {
    console.error('Confession creation error:', err);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, collegeId } = req.query;
    const query = {};
    if (search) {
      query.text = { $regex: search, $options: 'i' };
    }
    if (collegeId) {
      query.collegeId = collegeId.toLowerCase();
    }
    const confessions = await Confession.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Confession.countDocuments(query);
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const collegeQuery = collegeId ? { collegeId: collegeId.toLowerCase() } : {};
    
    const [students, today] = await Promise.all([
      Confession.distinct('ipHash', collegeQuery),
      Confession.countDocuments({ ...collegeQuery, createdAt: { $gte: startOfToday } })
    ]);
    
    res.json({ 
      confessions, 
      total, 
      page: Number(page), 
      totalPages: Math.ceil(total / limit),
      stats: {
        total,
        students: (students && students.length) || 0,
        today: today || 0
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const total = await Confession.countDocuments();
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const today = await Confession.countDocuments({ createdAt: { $gte: startOfToday } });
    const students = await Confession.distinct('ipHash');
    
    res.json({
      total,
      students: (students && students.length) || 0,
      today: today || 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const confession = await Confession.findOne({ 
      $or: [{ shortId: req.params.id }, { _id: req.params.id }] 
    });
    if (!confession) return res.status(404).json({ message: 'Not found' });
    res.json(confession);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.like = async (req, res) => {
  try {
    const ipHash = hashIP(req.ip);
    const confession = await Confession.findOne({ 
      $or: [{ shortId: req.params.id }, { _id: req.params.id }] 
    });
    if (!confession) return res.status(404).json({ message: 'Not found' });
    if (confession.likedIPs.includes(ipHash)) {
      return res.status(400).json({ message: 'Already liked' });
    }
    confession.likes += 1;
    confession.likedIPs.push(ipHash);
    await confession.save();
    req.app.get('io').emit('update-confession', confession);

    if (confession.userId && confession.userId !== req.body.userId) {
      const notification = await Notification.create({
        userId: confession.userId,
        type: 'like',
        message: `Someone liked your confession`,
        confessionId: confession.shortId,
      });
      const io = req.app.get('io');
      io.to(`user:${confession.userId}`).emit('new-notification', notification);
      io.to(`user:${confession.userId}`).emit('notifications-count', { count: 1 });
    }

    res.json({ likes: confession.likes });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.comment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }
    const confession = await Confession.findOne({ 
      $or: [{ shortId: req.params.id }, { _id: req.params.id }] 
    });
    if (!confession) return res.status(404).json({ message: 'Not found' });
    confession.comments.push({ text: text.trim().slice(0, 200) });
    await confession.save();
    req.app.get('io').emit('update-confession', confession);

    if (confession.userId && confession.userId !== req.body.userId) {
      const notification = await Notification.create({
        userId: confession.userId,
        type: 'comment',
        message: `Someone commented on your confession`,
        confessionId: confession.shortId,
      });
      const io = req.app.get('io');
      io.to(`user:${confession.userId}`).emit('new-notification', notification);
      io.to(`user:${confession.userId}`).emit('notifications-count', { count: 1 });
    }

    res.status(201).json(confession);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.trending = async (req, res) => {
  try {
    const confessions = await Confession.find()
      .sort({ likes: -1, createdAt: -1 })
      .limit(10);
    res.json(confessions);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const { username } = req.params;
    
    const confessions = await Confession.find({ userId: username });
    const totalConfessions = confessions.length;
    const totalLikes = confessions.reduce((sum, c) => sum + (c.likes || 0), 0);
    
    res.json({
      confessions: totalConfessions,
      likes: totalLikes
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteConfession = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;
    
    // Check if user is admin
    if (adminId !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const confession = await Confession.findByIdAndDelete(id);
    if (!confession) {
      return res.status(404).json({ message: 'Confession not found' });
    }
    
    // Emit socket event for deletion
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.emit('delete-confession', { id });
      if (confession.collegeId) {
        io.to(confession.collegeId).emit('delete-confession', { id });
      }
    }
    
    await Log.create({ action: 'delete-confession', target: 'confession', targetId: id, adminId, details: `Deleted confession ${confession.shortId || id}` });
    res.json({ message: 'Confession deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
