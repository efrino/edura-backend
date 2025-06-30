// Updated version: generateContentForTitle returns plain text, not JSON
const { model } = require('./geminiClient');

async function generateContentForTitle(title) {
    const prompt = `Buatkan penjelasan materi singkat dan latihan/tugas untuk sesi berjudul: "${title}". Formatkan sebagai teks ringkas, maksimal 500 karakter.`;

    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }]
        });

        const response = await result.response;
        const text = response.text().trim();

        // Saring teks jika terlalu panjang atau kosong
        if (!text || text.length < 20) throw new Error('Konten terlalu pendek atau kosong');

        return text;
    } catch (err) {
        console.warn(`[Fallback] Konten sesi "${title}" gagal di-generate. Gunakan placeholder.`);
        return `Konten pembelajaran untuk sesi "${title}" belum tersedia.`;
    }
}

module.exports = {
    generateContentForTitle
};