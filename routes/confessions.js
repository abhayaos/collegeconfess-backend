const express = require('express');
const ctrl = require('../controllers/confessionController');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/', rateLimiter, ctrl.create);
router.get('/', ctrl.getAll);
router.get('/trending', ctrl.trending);
router.get('/:id', ctrl.getOne);
router.post('/:id/like', rateLimiter, ctrl.like);
router.post('/:id/comment', rateLimiter, ctrl.comment);

module.exports = router;
