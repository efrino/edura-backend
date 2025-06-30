// === utils/generate-content.js ===
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logActivity } = require('./logger');

let keys;
try {
    keys = JSON.parse(process.env.GEMINI_API_KEYS || '[]');
} catch (e) {
    console.error('[GEMINI_CONFIG] Gagal parse GEMINI_API_KEYS:', e);
    keys = [];
}

async function generateContentForTitle(title) {
    const prompt = `Buatkan konten pembelajaran singkat (max 500 karakter) untuk sesi berjudul "${title}" dalam format berikut:
Materi:
<isi materi singkat>

Latihan:
<isi tugas atau pertanyaan singkat>`;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const result = await model.generateContent({
                contents: [{ parts: [{ text: prompt }] }],
            });

            const response = await result.response;
            const text = response.text().trim();

            const materiMatch = text.match(/Materi:\s*([\s\S]*?)\n\s*Latihan:/i);
            const latihanMatch = text.match(/Latihan:\s*([\s\S]*)$/i);

            const materi = materiMatch?.[1]?.trim() || null;
            const latihan = latihanMatch?.[1]?.trim() || null;

            if (!materi || !latihan) throw new Error('Output tidak sesuai format');

            return `Materi:\n${materi}\n\nLatihan:\n${latihan}`;
        } catch (err) {
            logActivity('GEN_CONTENT_RETRY', `Try ${i + 1} failed: ${err.message}`);
        }
    }

    logActivity('GEN_CONTENT_FAIL', `Semua token gagal digunakan. Fallback untuk title: "${title}"`);
    throw new Error('Kuota generate habis untuk hari ini. Silakan coba lagi dalam 1x24 jam.');
}

module.exports = {
    generateContentForTitle,
};
