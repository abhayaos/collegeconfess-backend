const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now },
});

const confessionSchema = new mongoose.Schema({
  shortId: { type: String, required: true, unique: true },
  title: { type: String, maxlength: 100 },
  text: { type: String, required: true, maxlength: 5000 },
  category: {
    type: String,
    enum: ['love', 'crush', 'study'],
    default: 'love',
  },
  anonymousName: { type: String, required: true },
  likes: { type: Number, default: 0 },
  likedIPs: [{ type: String }],
  comments: [commentSchema],
  ipHash: { type: String },
}, { timestamps: true });

confessionSchema.index({ text: 'text' });

module.exports = mongoose.model('Confession', confessionSchema);
