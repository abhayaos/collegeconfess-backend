const mongoose = require('mongoose');

const galiSchema = new mongoose.Schema({
  text: { type: String, required: true, maxlength: 500 },
  anonymousName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Gali', galiSchema);
