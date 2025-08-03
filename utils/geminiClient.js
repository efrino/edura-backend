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
