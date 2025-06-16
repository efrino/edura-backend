const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');
const { model } = require('../utils/geminiClient');

module.exports = {
    name: 'student-flashcard',
    version: '1.0.0',
    register: async function (server, options) {

        // === POST /student/courses/{courseId}/sessions/{sessionNumber}/flashcard ===
        server.route({
            method: 'POST',
            path: '/student/courses/{courseId}/sessions/{sessionNumber}/flashcard',
            options: {
                tags: ['api', 'Flashcard'],
                description: 'Generate or fetch flashcard for a session',
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

                // 1. Cek apakah flashcard sudah ada
                const { data: existing, error: fetchError } = await supabase
                    .from('course_flashcards')
                    .select('cards')
                    .eq('course_id', courseId)
                    .eq('session_number', sessionNumber)
                    .maybeSingle();

                if (fetchError) {
                    console.error(fetchError);
                    return h.response({ message: 'Gagal mengambil data flashcard' }).code(500);
                }

                if (existing) {
                    return h.response({ message: 'Flashcard sudah tersedia', cards: existing.cards }).code(200);
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

                // 3. Generate flashcard dari Gemini
                const prompt = `Buatkan flashcard pembelajaran dari materi berikut dengan format JSON array.
Judul: "${session.title}"
Materi:
${parsedContent?.overview || ''}

Langkah-langkah:
${(parsedContent?.steps || []).join('\n')}

Format output:
[
  { "term": "istilah 1", "definition": "penjelasan istilah 1" },
  ...
]`;

                let flashcards = [];

                try {
                    const result = await model.generateContent({
                        contents: [{ parts: [{ text: prompt }] }]
                    });
                    const text = result.response.text().trim();
                    const jsonStart = text.indexOf('[');
                    const jsonEnd = text.lastIndexOf(']');
                    if (jsonStart === -1 || jsonEnd === -1) throw new Error('Tidak ditemukan array flashcard');

                    const flashcardJson = text.slice(jsonStart, jsonEnd + 1);
                    flashcards = JSON.parse(flashcardJson);
                } catch (err) {
                    console.error('Gagal generate flashcard:', err);
                    return h.response({ message: 'Gagal generate flashcard' }).code(500);
                }

                // 4. Simpan ke Supabase
                const { error: insertError } = await supabase
                    .from('course_flashcards')
                    .insert({
                        course_id: courseId,
                        session_number: sessionNumber,
                        cards: flashcards,
                    });

                if (insertError) {
                    console.error(insertError);
                    return h.response({ message: 'Gagal menyimpan flashcard' }).code(500);
                }

                return h.response({ message: 'Flashcard berhasil digenerate', cards: flashcards }).code(201);
            }
        });

        // === GET /student/courses/{courseId}/sessions/{sessionNumber}/flashcard ===
        server.route({
            method: 'GET',
            path: '/student/courses/{courseId}/sessions/{sessionNumber}/flashcard',
            options: {
                tags: ['api', 'Flashcard'],
                description: 'Get flashcard for a specific session in a course',
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

                const { data, error } = await supabase
                    .from('course_flashcards')
                    .select('cards')
                    .eq('course_id', courseId)
                    .eq('session_number', sessionNumber)
                    .maybeSingle();

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal mengambil data flashcard' }).code(500);
                }

                if (!data) {
                    return h.response({ message: 'Flashcard belum tersedia untuk sesi ini' }).code(404);
                }

                return h.response({ cards: data.cards }).code(200);
            },
        });
    },
};
