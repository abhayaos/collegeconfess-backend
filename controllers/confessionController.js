const crypto = require('crypto');
const Confession = require('../models/Confession');
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
    let { text, category, title } = req.body;
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
    const confession = await Confession.create({
      shortId: await getUniqueShortId(),
      title: title.trim().slice(0, 100),
      text,
      category: category || 'love',
      anonymousName: randomName(),
      ipHash,
    });
    res.status(201).json(confession);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const query = {};
    if (search) {
      query.text = { $regex: search, $options: 'i' };
    }
    const confessions = await Confession.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Confession.countDocuments(query);
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const [students, today] = await Promise.all([
      Confession.distinct('ipHash'),
      Confession.countDocuments({ createdAt: { $gte: startOfToday } })
    ]);
    
    res.json({ 
      confessions, 
      total, 
      page: Number(page), 
      totalPages: Math.ceil(total / limit),
      stats: {
        total,
        students: students.length,
        today
      }
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
