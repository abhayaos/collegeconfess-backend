const express = require('express');
const ctrl = require('../controllers/galiController');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/', rateLimiter, ctrl.create);
router.get('/', ctrl.getAll);
router.delete('/:id', ctrl.deleteOne);

module.exports = router;
