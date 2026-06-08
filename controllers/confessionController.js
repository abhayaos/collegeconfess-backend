const crypto = require('crypto');
const mongoose = require('mongoose');
const Confession = require('../models/Confession');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Log = require('../models/Log');
const profanityFilter = require('../middleware/profanityFilter');
const cache = require('../utils/cache');

const FEED_PROJECTION = {
  text: 1, title: 1, category: 1, anonymousName: 1,
  collegeId: 1, likes: 1, comments: 1, createdAt: 1, isAd: 1, adLink: 1, shortId: 1, userId: 1, isPremium: 1, views: 1,
};

function findByIdOrShortId(id) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { $or: [{ shortId: id }, { _id: id }] };
  }
  return { shortId: id };
}

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
  'Sleeping Panda', 'Silent Ninja', 'Lost Engineer', 'Sad Potato',
  'Midnight Soul', 'Broken WiFi', 'Coffee Addict', 'Confused Human',
  'Hidden Tiger', 'Angry Penguin', 'Secret Rider', 'Lonely Coder',
  'Dream Walker', 'Late Assignment', 'Campus Ghost', 'Unknown Viber',
  'Crying Genius', 'Sleeping Owl', 'Mystery Lama', 'Bored Student',
  'Noisy Monkey', 'Toxic Tomato', 'Sneaky Panda', 'Night Surfer',
  'Lazy Dragon', 'Silent Storm', 'Fake Topper', 'Lost in Canteen',
  'Hungry Yak', 'Dark Coffee', 'Overthinking Goat', 'Last Bench Legend',
  'Low Battery Human', 'Assignment Survivor', 'Meme Dealer', 'Chiya Addict',
  'Sad Biryani', 'Hidden Chaos', 'Library Escapee', 'Anonymous 404',
  'Chiya Philosopher', 'Guff Master', 'Kanda Hunter', 'Hostel Survivor',
  'Canteen King', 'Exam Warrior', 'Tension Machine', 'Padhai Victim',
  'Guff Sansari', 'Crush Detective',
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
    if ((!text || !text.trim()) && (!title || !title.trim())) {
      return res.status(400).json({ message: 'Title or description is required' });
    }
    text = profanityFilter(sanitize(text || ''));
    title = profanityFilter(sanitize(title || ''));
    const ipHash = hashIP(req.ip);

    const userId = req.user ? req.user.username : null;
    const user = userId ? await User.findOne({ username: userId }) : null;
    const isPremium = user?.premium === true;

    if (!req.user) {
      const guestCount = await Confession.countDocuments({ ipHash, userId: null });
      if (guestCount >= 3) {
        return res.status(403).json({ message: 'Guest limit reached. Please login to continue posting.' });
      }
    }

    if (!isPremium) {
      const recent = await Confession.findOne({ ipHash })
        .sort({ createdAt: -1 });
      if (recent && Date.now() - new Date(recent.createdAt).getTime() < 30000) {
        return res.status(429).json({ message: 'Please wait 30 seconds before posting again' });
      }
    }

    const allowedCategories = ['love', 'crush', 'study', 'academic', 'friendship', 'rant', 'secret', 'relationship', 'funny', 'regret', 'college', 'teacher', 'hostel'];
    if (category && !allowedCategories.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    const isAd = req.body.isAd === true && isPremium;

    const confession = await Confession.create({
      shortId: await getUniqueShortId(),
      title: title.trim().slice(0, 100),
      text: text.trim().slice(0, 5000),
      category: category || 'love',
      anonymousName: randomName(),
      collegeId: collegeId ? collegeId.toLowerCase() : null,
      userId,
      ipHash,
      isPremium,
      isAd,
      adLink: isAd ? (req.body.adLink || '').trim().slice(0, 500) : undefined,
    });

    cache.delPattern('feed:*').catch(() => {});

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
    const { page = 1, limit = 10, search, category, collegeId, minLikes } = req.query;
    const numLimit = Number(limit);

    if (!search && !category && !collegeId) {
      const cacheKey = `feed:main:${page}:${numLimit}`;
      const cached = await cache.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const query = {};
    if (minLikes) {
      const min = Number(minLikes);
      if (!isNaN(min) && min > 0) query.likes = { $gte: min };
    }
    if (search) {
      if (search.length > 200) {
        return res.status(400).json({ message: 'Search query too long' });
      }
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.text = { $regex: escaped, $options: 'i' };
    }
    if (category && category !== 'all') {
      query.category = category;
    }
    if (collegeId) {
      query.collegeId = collegeId.toLowerCase();
    }

    const sort = search ? { createdAt: -1 } : { isAd: -1, createdAt: -1 };

    const [confessions, total] = await Promise.all([
      Confession.find(query, FEED_PROJECTION)
        .sort(sort)
        .skip((page - 1) * numLimit)
        .limit(numLimit)
        .lean(),
      Confession.countDocuments(query),
    ]);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const collegeQuery = collegeId ? { collegeId: collegeId.toLowerCase() } : {};
    const userQuery = collegeId ? { collegeId: collegeId.toUpperCase() } : {};

    const [students, today] = await Promise.all([
      User.countDocuments(userQuery),
      Confession.countDocuments({ ...collegeQuery, createdAt: { $gte: startOfToday } }),
    ]);

    const result = {
      confessions,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / numLimit),
      stats: { total, students: students || 0, today: today || 0 },
    };

    if (!search && !category && !collegeId && page <= 5) {
      cache.set(`feed:main:${page}:${numLimit}`, result, 15).catch(() => {});
    }

    res.json(result);
  } catch (err) {
    console.error('getAll error:', err);
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
    const confession = await Confession.findOneAndUpdate(
      findByIdOrShortId(req.params.id),
      { $inc: { views: 1 } },
      { new: true, projection: { likedIPs: 0, likedBy: 0, savedBy: 0, ipHash: 0 } }
    ).lean();
    if (!confession) return res.status(404).json({ message: 'Not found' });
    res.json(confession);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.recordView = async (req, res) => {
  try {
    const result = await Confession.findOneAndUpdate(
      findByIdOrShortId(req.params.id),
      { $inc: { views: 1 } },
      { projection: { _id: 1 } }
    );
    if (!result) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.like = async (req, res) => {
  try {
    const ipHash = hashIP(req.ip);
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) return res.status(404).json({ message: 'Not found' });
    if (confession.likedIPs.includes(ipHash)) {
      return res.status(400).json({ message: 'Already liked' });
    }
    confession.likes += 1;
    confession.likedIPs.push(ipHash);
    if (req.user?.username && !confession.likedBy.includes(req.user.username)) {
      confession.likedBy.push(req.user.username);
    }
    await confession.save();
    req.app.get('io').emit('update-confession', confession);

    const userId = req.user ? req.user.username : null;
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

    cache.delPattern('feed:*').catch(() => {});

    res.json({ likes: confession.likes });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.unlike = async (req, res) => {
  try {
    const ipHash = hashIP(req.ip);
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) return res.status(404).json({ message: 'Not found' });
    if (!confession.likedIPs.includes(ipHash)) {
      return res.status(400).json({ message: 'Not liked yet' });
    }
    confession.likes -= 1;
    confession.likedIPs = confession.likedIPs.filter((h) => h !== ipHash);
    if (req.user?.username) {
      confession.likedBy = confession.likedBy.filter((u) => u !== req.user.username);
    }
    await confession.save();
    req.app.get('io').emit('update-confession', confession);

    cache.delPattern('feed:*').catch(() => {});

    res.json({ likes: confession.likes });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getLikedIds = async (req, res) => {
  try {
    if (!req.user?.id) return res.json({ ids: [] });
    const confessions = await Confession.find({ likedBy: req.user.id }, { shortId: 1, _id: 0 });
    const ids = confessions.map((c) => c.shortId);
    res.json({ ids });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.save = async (req, res) => {
  try {
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) return res.status(404).json({ message: 'Not found' });
    const userId = req.user?.username || req.user?.id;
    if (!confession.savedBy.includes(userId)) {
      confession.savedBy.push(userId);
      await confession.save();
    }
    res.json({ message: 'Saved' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.unsave = async (req, res) => {
  try {
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) return res.status(404).json({ message: 'Not found' });
    const userId = req.user?.username || req.user?.id;
    confession.savedBy = confession.savedBy.filter((u) => u !== userId);
    await confession.save();
    res.json({ message: 'Unsaved' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getSavedIds = async (req, res) => {
  try {
    if (!req.user?.id) return res.json({ ids: [] });
    const userId = req.user?.username || req.user?.id;
    const confessions = await Confession.find({ savedBy: userId }, { shortId: 1, _id: 0 });
    const ids = confessions.map((c) => c.shortId);
    res.json({ ids });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getSaved = async (req, res) => {
  try {
    if (!req.user?.id) return res.json([]);
    const userId = req.user?.username || req.user?.id;
    const confessions = await Confession.find({ savedBy: userId }, FEED_PROJECTION).sort({ createdAt: -1 }).lean();
    res.json(confessions);
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
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) return res.status(404).json({ message: 'Not found' });
    const isAuthor = req.user && req.user.username && req.user.username === confession.userId;
    confession.comments.push({ text: profanityFilter(sanitize(text)).slice(0, 200), isAuthor });
    await confession.save();
    req.app.get('io').emit('update-confession', confession);

    const userId = req.user ? req.user.username : null;
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

    cache.delPattern('feed:*').catch(() => {});

    res.status(201).json(confession);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.reply = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Reply text is required' });
    }
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) return res.status(404).json({ message: 'Not found' });

    const parentComment = confession.comments.id(req.params.commentId);
    if (!parentComment) return res.status(404).json({ message: 'Comment not found' });

    const isAuthor = req.user && req.user.username && req.user.username === confession.userId;
    confession.comments.push({ text: profanityFilter(sanitize(text)).slice(0, 200), parentId: parentComment._id, isAuthor });
    await confession.save();
    req.app.get('io').emit('update-confession', confession);

    const userId = req.user ? req.user.username : null;
    if (confession.userId && confession.userId !== userId) {
      const notification = await Notification.create({
        userId: confession.userId,
        type: 'reply',
        message: `Someone replied to a comment on your confession`,
        confessionId: confession.shortId,
      });
      const io = req.app.get('io');
      io.to(`user:${confession.userId}`).emit('new-notification', notification);
      io.to(`user:${confession.userId}`).emit('notifications-count', { count: 1 });
    }

    cache.delPattern('feed:*').catch(() => {});

    res.status(201).json(confession);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getTodayCount = async (req, res) => {
  try {
    const { username } = req.params;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const count = await Confession.countDocuments({
      userId: username,
      createdAt: { $gte: startOfToday },
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.trending = async (req, res) => {
  try {
    const confessions = await Confession.find({}, FEED_PROJECTION)
      .sort({ likes: -1, createdAt: -1 })
      .limit(10)
      .lean();
    res.json(confessions);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const { username } = req.params;

    const [result] = await Confession.aggregate([
      { $match: { userId: username } },
      { $group: { _id: null, total: { $sum: 1 }, likes: { $sum: '$likes' }, comments: { $sum: { $size: '$comments' } } } },
    ]);

    res.json({
      confessions: result?.total || 0,
      likes: result?.likes || 0,
      comments: result?.comments || 0,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getLiked = async (req, res) => {
  try {
    if (!req.user?.id) return res.json([]);
    const userId = req.user?.username || req.user?.id;
    const confessions = await Confession.find({ likedBy: userId }, FEED_PROJECTION).sort({ createdAt: -1 }).lean();
    res.json(confessions);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserConfessions = async (req, res) => {
  try {
    const { username } = req.params;
    const confessions = await Confession.find({ userId: username }, FEED_PROJECTION).sort({ createdAt: -1 }).lean();
    res.json(confessions);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addLikes = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || typeof amount !== 'number' || amount < 1 || !Number.isInteger(amount)) {
      return res.status(400).json({ message: 'Amount must be a positive integer' });
    }
    if (amount > 100000) {
      return res.status(400).json({ message: 'Amount cannot exceed 100,000' });
    }
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) {
      return res.status(404).json({ message: 'Confession not found' });
    }
    confession.likes += amount;
    await confession.save();
    cache.delPattern('feed:*').catch(() => {});
    if (req.app.get('io')) {
      req.app.get('io').emit('update-confession', confession);
    }
    if (confession.userId) {
      const notification = await Notification.create({
        userId: confession.userId,
        type: 'like',
        message: `Your confession got ${amount} new likes`,
        confessionId: confession.shortId,
      });
      const io = req.app.get('io');
      io.to(`user:${confession.userId}`).emit('new-notification', notification);
      io.to(`user:${confession.userId}`).emit('notifications-count', { count: 1 });
    }
    await Log.create({ action: 'add-likes', target: 'confession', targetId: confession.shortId, adminId: req.user.id, details: `Added ${amount} likes to confession ${confession.shortId}` });
    res.json({ likes: confession.likes });
  } catch (err) {
    console.error('addLikes error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addViews = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || typeof amount !== 'number' || amount < 1 || !Number.isInteger(amount)) {
      return res.status(400).json({ message: 'Amount must be a positive integer' });
    }
    if (amount > 100000) {
      return res.status(400).json({ message: 'Amount cannot exceed 100,000' });
    }
    const confession = await Confession.findOne(findByIdOrShortId(req.params.id));
    if (!confession) {
      return res.status(404).json({ message: 'Confession not found' });
    }
    confession.views += amount;
    await confession.save();
    cache.delPattern('feed:*').catch(() => {});
    if (req.app.get('io')) {
      req.app.get('io').emit('update-confession', confession);
    }
    await Log.create({ action: 'add-views', target: 'confession', targetId: confession.shortId, adminId: req.user.id, details: `Added ${amount} views to confession ${confession.shortId}` });
    res.json({ views: confession.views });
  } catch (err) {
    console.error('addViews error:', err);
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

    cache.delPattern('feed:*').catch(() => {});

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
