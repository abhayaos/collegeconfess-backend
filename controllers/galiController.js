const Gali = require('../models/Gali');

const names = [
  'Angry Panda', 'Frustrated Fox', 'Mad Tiger', 'Raging Lion',
  'Stormy Bear', 'Fuming Wolf', 'Cranky Cat', 'Grumpy Owl',
  'Irate Eagle', 'Charging Bull', 'Snappy Croc', 'Fired Up Phoenix',
];

function randomName() {
  return names[Math.floor(Math.random() * names.length)];
}

exports.create = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Text is required' });
    }
    if (text.length > 500) {
      return res.status(400).json({ message: 'Text must be under 500 characters' });
    }
    const gali = await Gali.create({
      text: text.trim(),
      anonymousName: randomName(),
    });
    req.app.get('io')?.emit('gali-created', gali);
    res.status(201).json(gali);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const galis = await Gali.find().sort({ createdAt: -1 }).limit(50);
    res.json(galis);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    await Gali.findByIdAndDelete(req.params.id);
    req.app.get('io')?.emit('gali-deleted', { id: req.params.id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
