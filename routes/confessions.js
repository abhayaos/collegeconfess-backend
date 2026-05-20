const express = require('express');
const ctrl = require('../controllers/confessionController');
const rateLimiter = require('../middleware/rateLimiter');
const { requireVerified } = require('../middleware/verification');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/', rateLimiter.strict, authenticate, requireVerified, ctrl.create);
router.get('/', ctrl.getAll);
router.get('/stats', ctrl.getStats);
router.get('/trending', ctrl.trending);
router.get('/user/:username', ctrl.getUserStats);
router.delete('/:id', authenticate, requireAdmin, ctrl.deleteConfession);
router.get('/:id', ctrl.getOne);
router.post('/:id/like', rateLimiter, ctrl.like);
router.post('/:id/comment', rateLimiter, authenticate, requireVerified, ctrl.comment);

module.exports = router;
