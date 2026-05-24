const express = require('express');
const ctrl = require('../controllers/galiController');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/', rateLimiter, ctrl.create);
router.get('/', rateLimiter, ctrl.getAll);
router.delete('/:id', authenticate, requireAdmin, ctrl.deleteOne);

module.exports = router;
