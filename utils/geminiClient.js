const { GoogleGenerativeAI } = require('@google/generative-ai');

let keys;
try {
    keys = JSON.parse(process.env.GEMINI_API_KEYS || '[]');
} catch (e) {
    console.error('[GEMINI_CONFIG] Gagal parse GEMINI_API_KEYS:', e);
    keys = [];
}

let currentIndex = 0;

function getNextModel() {
    if (!keys.length) {
        throw new Error('Tidak ada API Key Gemini yang tersedia di ENV.');
    }

    const key = keys[currentIndex];
    currentIndex = (currentIndex + 1) % keys.length;

    const genAI = new GoogleGenerativeAI(key);
    return genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
}

module.exports = { getNextModel };
