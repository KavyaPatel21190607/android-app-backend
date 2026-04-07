const https = require('https');

// In-memory translation cache: { "hi:Hello" -> "नमस्ते" }
const translationCache = new Map();

// @desc    Translate text using Google Translation API
// @route   POST /api/translate
exports.translate = async (req, res) => {
  try {
    const { texts, targetLang } = req.body;
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ message: 'Translation API key not configured' });
    }

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ message: 'Please provide texts array' });
    }

    if (!targetLang) {
      return res.status(400).json({ message: 'Please provide targetLang' });
    }

    // If target is English, return original texts
    if (targetLang === 'en') {
      return res.json({ translations: texts });
    }

    // Check cache first
    const results = [];
    const uncachedTexts = [];
    const uncachedIndices = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = `${targetLang}:${texts[i]}`;
      if (translationCache.has(cacheKey)) {
        results[i] = translationCache.get(cacheKey);
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // If all cached, return immediately
    if (uncachedTexts.length === 0) {
      return res.json({ translations: results });
    }

    // Build Google Translate API URL
    const url = new URL('https://translation.googleapis.com/language/translate/v2');
    url.searchParams.append('key', apiKey);
    url.searchParams.append('target', targetLang);
    url.searchParams.append('format', 'text');

    // Build request body with multiple 'q' parameters
    const queryParams = uncachedTexts.map(t => `q=${encodeURIComponent(t)}`).join('&');
    const fullUrl = `${url.toString()}&${queryParams}`;

    // Make the API call
    const response = await new Promise((resolve, reject) => {
      https.get(fullUrl, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid response from translation API'));
          }
        });
      }).on('error', reject);
    });

    if (response.error) {
      console.error('[TRANSLATE] API error:', response.error.message);
      return res.status(500).json({ 
        message: 'Translation failed', 
        error: response.error.message 
      });
    }

    // Map translated texts back to results
    const translations = response.data?.translations || [];
    for (let i = 0; i < translations.length; i++) {
      const translated = translations[i].translatedText;
      const originalIndex = uncachedIndices[i];
      results[originalIndex] = translated;
      
      // Cache the translation
      const cacheKey = `${targetLang}:${texts[originalIndex]}`;
      translationCache.set(cacheKey, translated);
    }

    // Fill any remaining gaps with original text
    for (let i = 0; i < texts.length; i++) {
      if (!results[i]) results[i] = texts[i];
    }

    res.json({ translations: results });
  } catch (error) {
    console.error('[TRANSLATE] Error:', error.message);
    res.status(500).json({ message: 'Translation error', error: error.message });
  }
};

// @desc    Get supported languages
// @route   GET /api/translate/languages
exports.getLanguages = (req, res) => {
  const languages = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰' }
  ];
  res.json({ languages });
};
