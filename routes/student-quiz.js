const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');
const { model } = require('../utils/geminiClient');

module.exports = {
    name: 'student-quiz',
    version: '1.0.0',
    register: async function (server, options) {
        server.route({
            method: 'POST',
            path: '/student/courses/{courseId}/sessions/{sessionNumber}/quiz',
            options: {
                tags: ['api', 'Quiz'],
                description: 'Generate or fetch quiz for a session',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    params: Joi.object({
                        courseId: Joi.string().guid().required(),
                        sessionNumber: Joi.number().integer().min(1).max(16).required(),
                    }),
                },
            },
            handler: async (request, h) => {
                const { courseId, sessionNumber } = request.params;

                // 1. Cek apakah quiz sudah ada
                const { data: existing, error: fetchError } = await supabase
                    .from('course_quizzes')
                    .select('questions')
                    .eq('course_id', courseId)
                    .eq('session_number', sessionNumber)
                    .maybeSingle();

                if (fetchError) {
                    console.error(fetchError);
                    return h.response({ message: 'Gagal mengambil data quiz' }).code(500);
                }

                if (existing) {
                    return h.response({ message: 'Quiz sudah tersedia', source: 'cache', questions: existing.questions }).code(200);
                }

                // 2. Ambil title & content dari course_sessions
                const { data: session, error: sessionError } = await supabase
                    .from('course_sessions')
                    .select('title, content')
                    .eq('course_id', courseId)
                    .eq('session_number', sessionNumber)
                    .single();

                if (sessionError || !session) {
                    return h.response({ message: 'Sesi tidak ditemukan' }).code(404);
                }

                const parsedContent = typeof session.content === 'string' ? JSON.parse(session.content) : session.content;

                const title = session.title;
                const content = `
${parsedContent?.overview || ''}
${(parsedContent?.steps || []).join('\n')}
                `;

                // 3. Generate quiz dari Gemini
                const prompt = `
Buatkan 3 soal pilihan ganda berbasis konten sesi berikut:

Judul: ${title}
Konten:
${content}

Jangan tambahkan penjelasan. Format harus berupa array JSON seperti ini:
[
  {
    "question": "Apa itu X?",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "A"
  },
  ...
]`;

                let questions = [];

                try {
                    const result = await model.generateContent({
                        contents: [{ parts: [{ text: prompt }] }]
                    });

                    const text = result.response.text().trim();
                    const jsonStart = text.indexOf('[');
                    const jsonEnd = text.lastIndexOf(']');
                    if (jsonStart === -1 || jsonEnd === -1) {
                        throw new Error('Tidak ditemukan array JSON valid');
                    }

                    const quizJson = text.slice(jsonStart, jsonEnd + 1);
                    questions = JSON.parse(quizJson);

                    // Validasi dasar struktur quiz
                    const isValid = questions.every(q =>
                        q.question &&
                        Array.isArray(q.options) &&
                        q.options.length === 4 &&
                        typeof q.correct_answer === 'string'
                    );

                    if (!isValid) throw new Error('Struktur soal tidak valid');

                } catch (err) {
                    console.error('Gagal generate quiz:', err);
                    return h.response({ message: 'Gagal generate quiz dari AI' }).code(500);
                }

                // 4. Simpan ke Supabase
                const { error: insertError } = await supabase
                    .from('course_quizzes')
                    .insert({
                        course_id: courseId,
                        session_number: sessionNumber,
                        questions,
                    });

                if (insertError) {
                    console.error(insertError);
                    return h.response({ message: 'Gagal menyimpan quiz' }).code(500);
                }

                return h.response({
                    message: 'Quiz berhasil digenerate dan disimpan',
                    source: 'ai',
                    questions,
                }).code(201);
            }
        });
    },
};
