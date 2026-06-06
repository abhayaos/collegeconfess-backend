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
    enum: ['love', 'crush', 'study', 'academic', 'friendship', 'rant', 'secret', 'relationship', 'funny', 'regret', 'college', 'teacher', 'hostel'],
    default: 'love',
  },
  anonymousName: { type: String, required: true },
  collegeId: { type: String, lowercase: true },
  userId: { type: String },
  likes: { type: Number, default: 0 },
  likedIPs: [{ type: String }],
  likedBy: [{ type: String }],
  savedBy: [{ type: String }],
  comments: [commentSchema],
  ipHash: { type: String },
  isPremium: { type: Boolean, default: false },
  isAd: { type: Boolean, default: false },
  adLink: { type: String },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

confessionSchema.index({ text: 'text' });
confessionSchema.index({ createdAt: -1 });
confessionSchema.index({ isAd: -1, createdAt: -1 });
confessionSchema.index({ collegeId: 1, createdAt: -1 });
confessionSchema.index({ category: 1, createdAt: -1 });
confessionSchema.index({ collegeId: 1, category: 1, createdAt: -1 });
confessionSchema.index({ likes: -1, createdAt: -1 });
confessionSchema.index({ ipHash: 1, createdAt: -1 });
confessionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Confession', confessionSchema);
