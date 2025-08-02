// utils/generate-content.js
const { logActivity } = require('./logger');
const { loadActiveGeminiKey, getNextModel } = require('./geminiClient');

async function generateContentForTitle(title) {
    const prompt = `
Kamu adalah AI pengajar yang ahli di bidangnya.

Tugasmu adalah membuat **materi pembelajaran yang lengkap, terstruktur, dan mudah dipahami** untuk sesi dengan judul:
"${title}"

Tulis dengan format:
<Materi:>
Isi materi lengkap, dengan struktur yang rapi dan penjelasan komprehensif.
Hindari menambahkan bagian Latihan atau Pertanyaan di akhir. Fokus hanya pada konten pembelajaran.
Berikan penjelasan yang mendalam, contoh konkret, dan referensi jika perlu.
Pastikan konten sesuai dengan judul dan mudah dipahami oleh siswa.
Jangan gunakan format lain selain yang sudah ditentukan. `;
    try {
        await loadActiveGeminiKey();
        const model = getNextModel();

        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
        });

        const response = await result.response;
        const text = response.text().trim();

        // Ambil isi setelah "Materi:" saja
        const materiMatch = text.match(/Materi:\s*([\s\S]*)$/i);
        const materi = materiMatch?.[1]?.trim() || null;

        if (!materi) throw new Error('Konten tidak sesuai format (Materi tidak ditemukan)');

        return `Materi:\n${materi}`;
    } catch (err) {
        logActivity('GEN_CONTENT_FAIL', `Gagal generate konten: ${err.message}`);
        throw new Error('Gagal generate konten. Silakan coba lagi nanti.');
    }
}

module.exports = {
    generateContentForTitle,
};
