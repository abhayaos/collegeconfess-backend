const express = require('express');
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, ctrl.getNotifications);
router.get('/unread-count', authenticate, ctrl.getUnreadCount);
router.put('/:id/read', authenticate, ctrl.markRead);
router.put('/read-all', authenticate, ctrl.markAllRead);

module.exports = router;
