const express = require('express');
const router = express.Router();
const { translate, getLanguages } = require('../controllers/translateController');
const { protect } = require('../middleware/auth');

// POST /api/translate - Translate texts (protected)
router.post('/', protect, translate);

// GET /api/translate/languages - Get supported languages (public)
router.get('/languages', getLanguages);

module.exports = router;
