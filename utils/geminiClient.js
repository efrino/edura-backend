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
// const { GoogleGenerativeAI } = require('@google/generative-ai');

// let keys = [];
// let currentIndex = 0;

// try {
//     const envKeys = process.env.GEMINI_API_KEYS;
//     if (envKeys) {
//         const parsed = JSON.parse(envKeys);
//         if (Array.isArray(parsed)) keys = parsed;
//     }
// } catch (e) {
//     console.error('[GEMINI_CONFIG] Gagal parse GEMINI_API_KEYS dari ENV:', e);
// }

// function getNextModel() {
//     if (!keys.length) {
//         throw new Error('Tidak ada API Key Gemini yang tersedia di ENV.');
//     }

//     const key = keys[currentIndex];
//     currentIndex = (currentIndex + 1) % keys.length;

//     const genAI = new GoogleGenerativeAI(key);
//     return genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
// }

// function updateGeminiKeys(newKeys = []) {
//     if (!Array.isArray(newKeys)) return;
//     keys = newKeys;
//     currentIndex = 0;
//     console.log(`[GEMINI_CONFIG] API Keys updated. Total: ${keys.length}`);
// }

// module.exports = { getNextModel, updateGeminiKeys };
// utils/geminiClient.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const supabase = require('../db');

let currentKey = null;

async function loadActiveGeminiKey() {
    const { data, error } = await supabase
        .from('env_config')
        .select('value')
        .eq('key', 'GEMINI_API_KEYS')
        .maybeSingle();

    if (error || !data || !Array.isArray(data.value)) {
        console.error('[GEMINI_CONFIG] Gagal load GEMINI_API_KEYS dari Supabase:', error || 'Data kosong');
        throw new Error('Tidak ada key Gemini yang tersedia di Supabase.');
    }

    // Cari key yang set_active: true
    const activeKeyEntry = data.value.find(k => k.set_active === true);

    if (!activeKeyEntry || !activeKeyEntry.api_key) {
        console.error('[GEMINI_CONFIG] Tidak ada key yang aktif (set_active=true)');
        throw new Error('Tidak ada API key Gemini yang aktif');
    }

    currentKey = activeKeyEntry.api_key;
    console.log('[GEMINI_CONFIG] Active Gemini API key loaded from Supabase');
}

function getNextModel() {
    if (!currentKey) throw new Error('Gemini API Key belum dimuat. Panggil loadActiveGeminiKey() dulu.');
    const genAI = new GoogleGenerativeAI(currentKey);
    return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

module.exports = {
    getNextModel,
    loadActiveGeminiKey
};
