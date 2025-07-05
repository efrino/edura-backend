// const { GoogleGenerativeAI } = require('@google/generative-ai');

// let keys;
// try {
//     keys = JSON.parse(process.env.GEMINI_API_KEYS || '[]');
// } catch (e) {
//     console.error('[GEMINI_CONFIG] Gagal parse GEMINI_API_KEYS:', e);
//     keys = [];
// }

// let currentIndex = 0;

// function getNextModel() {
//     if (!keys.length) {
//         throw new Error('Tidak ada API Key Gemini yang tersedia di ENV.');
//     }

//     const key = keys[currentIndex];
//     currentIndex = (currentIndex + 1) % keys.length;

//     const genAI = new GoogleGenerativeAI(key);
//     return genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
// }

// module.exports = { getNextModel };
const { GoogleGenerativeAI } = require('@google/generative-ai');

let keys = [];
let currentIndex = 0;

try {
    const envKeys = process.env.GEMINI_API_KEYS;
    if (envKeys) {
        const parsed = JSON.parse(envKeys);
        if (Array.isArray(parsed)) keys = parsed;
    }
} catch (e) {
    console.error('[GEMINI_CONFIG] Gagal parse GEMINI_API_KEYS dari ENV:', e);
}

function getNextModel() {
    if (!keys.length) {
        throw new Error('Tidak ada API Key Gemini yang tersedia di ENV.');
    }

    const key = keys[currentIndex];
    currentIndex = (currentIndex + 1) % keys.length;

    const genAI = new GoogleGenerativeAI(key);
    return genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
}

function updateGeminiKeys(newKeys = []) {
    if (!Array.isArray(newKeys)) return;
    keys = newKeys;
    currentIndex = 0;
    console.log(`[GEMINI_CONFIG] API Keys updated. Total: ${keys.length}`);
}

module.exports = { getNextModel, updateGeminiKeys };
