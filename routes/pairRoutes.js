const express = require('express');
const router = express.Router();
const { pairUsers, getPairedUsers, unpairUser } = require('../controllers/pairController');
const { protect } = require('../middleware/auth');

// POST /api/pair - Pair with another user using code
router.post('/', protect, pairUsers);

// GET /api/pair/users - Get list of paired users
router.get('/users', protect, getPairedUsers);

// DELETE /api/pair/:userId - Unpair from a user
router.delete('/:userId', protect, unpairUser);

module.exports = router;
