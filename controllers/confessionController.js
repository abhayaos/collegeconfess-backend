const crypto = require('crypto');
const Confession = require('../models/Confession');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Log = require('../models/Log');
const profanityFilter = require('../middleware/profanityFilter');

function generateShortId() {
  return crypto.randomInt(100000, 999999).toString();
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

function sanitize(str) {
  return str.replace(/[<>]/g, '').trim();
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
    text = profanityFilter(sanitize(text));
    title = sanitize(title);
    const ipHash = hashIP(req.ip);
    const recent = await Confession.findOne({ ipHash })
      .sort({ createdAt: -1 });
    if (recent && Date.now() - new Date(recent.createdAt).getTime() < 30000) {
      return res.status(429).json({ message: 'Please wait 30 seconds before posting again' });
    }

    const allowedCategories = ['love', 'crush', 'study', 'academic', 'friendship', 'rant', 'secret'];
    if (category && !allowedCategories.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    const userId = req.user ? req.user.username : (req.body.userId || null);

    const confession = await Confession.create({
      shortId: await getUniqueShortId(),
      title: title.trim().slice(0, 100),
      text: text.trim().slice(0, 5000),
      category: category || 'love',
      anonymousName: randomName(),
      collegeId: collegeId ? collegeId.toLowerCase() : null,
      userId,
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
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category, collegeId } = req.query;
    const query = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.text = { $regex: escaped, $options: 'i' };
    }
    if (category && category !== 'all') {
      query.category = category;
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

    const userQuery = collegeId ? { collegeId: collegeId.toUpperCase() } : {};
    const [students, today] = await Promise.all([
      User.countDocuments(userQuery),
      Confession.countDocuments({ ...collegeQuery, createdAt: { $gte: startOfToday } })
    ]);

    res.json({
      confessions,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      stats: {
        total,
        students: students || 0,
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
    const students = await User.countDocuments();

    res.json({
      total,
      students: students || 0,
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

    const userId = req.user ? req.user.username : (req.body.userId || null);
    if (confession.userId && confession.userId !== userId) {
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
    confession.comments.push({ text: sanitize(text).slice(0, 200) });
    await confession.save();
    req.app.get('io').emit('update-confession', confession);

    const userId = req.user ? req.user.username : (req.body.userId || null);
    if (confession.userId && confession.userId !== userId) {
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

    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const confession = await Confession.findByIdAndDelete(id);
    if (!confession) {
      return res.status(404).json({ message: 'Confession not found' });
    }

    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.emit('delete-confession', { id });
      if (confession.collegeId) {
        io.to(confession.collegeId).emit('delete-confession', { id });
      }
    }

    await Log.create({ action: 'delete-confession', target: 'confession', targetId: id, adminId: req.user.id, details: `Deleted confession ${confession.shortId || id}` });
    res.json({ message: 'Confession deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
