const express = require('express');
const ctrl = require('../controllers/confessionController');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/', rateLimiter.strict, authenticate, ctrl.create);
router.get('/', rateLimiter, ctrl.getAll);
router.get('/stats', rateLimiter, ctrl.getStats);
router.get('/trending', rateLimiter, ctrl.trending);
router.get('/user/:username', rateLimiter, ctrl.getUserStats);
router.get('/liked-ids', rateLimiter, ctrl.getLikedIds);
router.get('/saved-ids', rateLimiter, authenticate, ctrl.getSavedIds);
router.get('/liked', rateLimiter, authenticate, ctrl.getLiked);
router.get('/user/:username/posts', rateLimiter, ctrl.getUserConfessions);
router.get('/user/:username/today-count', rateLimiter, ctrl.getTodayCount);
router.get('/saved', rateLimiter, authenticate, ctrl.getSaved);
router.delete('/:id', authenticate, requireAdmin, ctrl.deleteConfession);
router.post('/:id/add-likes', authenticate, requireAdmin, ctrl.addLikes);
router.post('/:id/add-views', authenticate, requireAdmin, ctrl.addViews);
router.get('/:id', rateLimiter, ctrl.getOne);
router.post('/:id/view', rateLimiter, ctrl.recordView);
router.post('/:id/like', rateLimiter, ctrl.like);
router.post('/:id/unlike', rateLimiter, ctrl.unlike);
router.post('/:id/save', rateLimiter, authenticate, ctrl.save);
router.post('/:id/unsave', rateLimiter, authenticate, ctrl.unsave);
router.post('/:id/comment', rateLimiter, authenticate, ctrl.comment);
router.post('/:id/comment/:commentId/reply', rateLimiter, authenticate, ctrl.reply);

module.exports = router;
