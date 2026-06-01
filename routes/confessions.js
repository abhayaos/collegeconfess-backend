const express = require('express');
const ctrl = require('../controllers/confessionController');
const rateLimiter = require('../middleware/rateLimiter');
const { requireVerified } = require('../middleware/verification');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/', rateLimiter.strict, authenticate, requireVerified, ctrl.create);
router.get('/', rateLimiter, ctrl.getAll);
router.get('/stats', rateLimiter, ctrl.getStats);
router.get('/trending', rateLimiter, ctrl.trending);
router.get('/user/:username', rateLimiter, ctrl.getUserStats);
router.get('/liked-ids', rateLimiter, authenticate, ctrl.getLikedIds);
router.get('/saved-ids', rateLimiter, authenticate, ctrl.getSavedIds);
router.get('/saved', rateLimiter, authenticate, ctrl.getSaved);
router.delete('/:id', authenticate, requireAdmin, ctrl.deleteConfession);
router.get('/:id', rateLimiter, ctrl.getOne);
router.post('/:id/like', rateLimiter, authenticate, requireVerified, ctrl.like);
router.post('/:id/unlike', rateLimiter, authenticate, requireVerified, ctrl.unlike);
router.post('/:id/save', rateLimiter, authenticate, requireVerified, ctrl.save);
router.post('/:id/unsave', rateLimiter, authenticate, requireVerified, ctrl.unsave);
router.post('/:id/comment', rateLimiter, authenticate, requireVerified, ctrl.comment);
router.post('/:id/comment/:commentId/reply', rateLimiter, authenticate, requireVerified, ctrl.reply);

module.exports = router;
