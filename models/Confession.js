const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now },
  parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
});

const confessionSchema = new mongoose.Schema({
  shortId: { type: String, required: true, unique: true },
  title: { type: String, maxlength: 100 },
  text: { type: String, default: '', maxlength: 5000 },
  category: {
    type: String,
    enum: ['love', 'crush', 'study', 'academic', 'friendship', 'rant', 'secret'],
    default: 'love',
  },
  anonymousName: { type: String, required: true },
  collegeId: { type: String, lowercase: true },
  userId: { type: String },
  likes: { type: Number, default: 0 },
  likedIPs: [{ type: String }],
  comments: [commentSchema],
  ipHash: { type: String },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

confessionSchema.index({ text: 'text' });

module.exports = mongoose.model('Confession', confessionSchema);
