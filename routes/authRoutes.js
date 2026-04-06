const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// POST /api/auth/register - Register new admin or user
router.post('/register', register);

// POST /api/auth/login - Login
router.post('/login', login);

// GET /api/auth/profile - Get logged-in user's profile (requires login)
router.get('/profile', protect, getProfile);

// PUT /api/auth/profile - Update logged-in user's profile (requires login)
router.put('/profile', protect, updateProfile);

module.exports = router;
