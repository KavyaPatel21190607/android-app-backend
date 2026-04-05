const express = require('express');
const router = express.Router();
const { pairUsers, getPairedUsers, unpairUser, regenerateCode } = require('../controllers/pairController');
const { protect } = require('../middleware/auth');

// POST /api/pair - Pair with another user using code
router.post('/', protect, pairUsers);

// POST /api/pair/regenerate-code - Regenerate pair code
router.post('/regenerate-code', protect, regenerateCode);

// GET /api/pair/users - Get list of paired users
router.get('/users', protect, getPairedUsers);

// DELETE /api/pair/:userId - Unpair from a user
router.delete('/:userId', protect, unpairUser);

module.exports = router;
