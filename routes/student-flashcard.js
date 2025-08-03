const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');
const { getNextModel } = require('../utils/geminiClient');
const Boom = require('@hapi/boom');

module.exports = {
    name: 'student-flashcard',
    version: '1.0.0',
    register: async function (server, options) {
        // === GET flashcards for student ===
        server.route({
            method: 'GET',
            path: '/student/flashcards',
            options: {
                tags: ['api', 'Student', 'Flashcard'],
                description: 'Get student flashcards for a specific course',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    query: Joi.object({
                        course_id: Joi.string().required(),
                    }),
                },
            },
            handler: async (req, h) => {
                const { course_id } = req.query;
                const student_id = req.auth.credentials.id;

                try {
                    const { data, error } = await supabase
                        .from('student_flashcards')
                        .select('session_number, cards, created_at')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .order('session_number');

                    if (error) throw error;
                    if (!data || data.length === 0) {
                        return Boom.notFound('Flashcards not found for this course');
                    }

                    return h.response({
                        message: 'Flashcards found',
                        flashcards: data,
                    }).code(200);
                } catch (err) {
                    //console.error('🔥 Error fetching student flashcards:', err);
                    return Boom.internal('Failed to fetch student flashcards');
                }
            },
        });
        // === GET Flashcard Generation Status ===
        server.route({
            method: 'GET',
            path: '/student/flashcards/status',
            options: {
                tags: ['api', 'Student', 'Flashcard'],
                description: 'Check flashcard generation status for a course',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    query: Joi.object({
                        course_id: Joi.string().required(),
                    }),
                },
            },
            handler: async (req, h) => {
                const { course_id } = req.query;
                const student_id = req.auth.credentials.id;

                try {
                    const { data, error } = await supabase
                        .from('student_flashcard_status')
                        .select('status, updated_at')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (error) {
                        //console.error('🔥 Error checking flashcard status:', error.message);
                        return Boom.internal('Failed to check flashcard status');
                    }

                    if (!data) {
                        return h.response({
                            status: 'not_started',
                            message: 'Belum ada proses generate dimulai.',
                        }).code(200);
                    }

                    return h.response({
                        status: data.status,
                        updated_at: data.updated_at,
                        message: `Status: ${data.status}`,
                    }).code(200);
                } catch (err) {
                    //console.error('🔥 Error checking status:', err);
                    return Boom.internal('Failed to check status');
                }
            },
        });


        // === POST generate flashcards ===
        server.route({
            method: 'POST',
            path: '/student/flashcards/generate',
            options: {
                tags: ['api', 'Student', 'Flashcard'],
                description: 'Generate 1 flashcard per session (batch async-style)',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    payload: Joi.object({
                        course_id: Joi.string().required(),
                    }),
                },
            },
            handler: async (req, h) => {
                const { course_id } = req.payload;
                const student_id = req.auth.credentials.id;

                try {
                    // 1. Cek status
                    const { data: statusRow } = await supabase
                        .from('student_flashcard_status')
                        .select('status')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (statusRow?.status === 'generating') {
                        return Boom.badRequest('Flashcards sedang diproses. Silakan tunggu.');
                    }

                    // 2. Set status jadi generating
                    await supabase.from('student_flashcard_status').upsert({
                        student_id,
                        course_id,
                        status: 'generating',
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'student_id,course_id' });

                    // 3. Proses langsung (tanpa setTimeout)
                    const { data: sessions } = await supabase
                        .from('course_sessions')
                        .select('session_number, title, content')
                        .eq('course_id', course_id)
                        .order('session_number');

                    const model = getNextModel();
                    let flashcardsToInsert = [];

                    for (const session of sessions.slice(0, 10)) {
                        const { session_number, title, content } = session;

                        let cards = [];
                        const { data: existingFC } = await supabase
                            .from('course_flashcards')
                            .select('cards')
                            .eq('course_id', course_id)
                            .eq('session_number', session_number)
                            .maybeSingle();

                        if (existingFC?.cards?.length >= 5) {
                            cards = existingFC.cards;
                        } else {
                            const prompt = `
Kamu adalah AI pengajar. Buatkan 16 flashcard dalam format JSON array:
[{"question":"Apa itu ...?","answer":"..."}]
Judul: ${title}
Materi: ${content}
`;
                            const result = await model.generateContent({
                                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                            });

                            const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            const jsonMatch = text.match(/\[\s*{[\s\S]*?}\s*\]/);
                            try {
                                if (jsonMatch) cards = JSON.parse(jsonMatch[0]);
                            } catch (_) { }

                            if (cards.length >= 8) {
                                cards = cards.sort(() => 0.5 - Math.random()).slice(0, 5);
                                await supabase.from('course_flashcards').upsert({
                                    course_id,
                                    session_number,
                                    cards,
                                    created_at: new Date().toISOString(),
                                }, { onConflict: 'course_id,session_number' });
                            }
                        }

                        if (cards.length > 0) {
                            const selected = cards[Math.floor(Math.random() * cards.length)];
                            flashcardsToInsert.push({
                                student_id,
                                course_id,
                                session_number,
                                cards: [selected],
                                created_at: new Date().toISOString(),
                            });
                        }
                    }

                    if (flashcardsToInsert.length > 0) {
                        await supabase
                            .from('student_flashcards')
                            .insert(flashcardsToInsert, { ignoreDuplicates: true });

                        await supabase
                            .from('student_flashcard_status')
                            .update({ status: 'done', updated_at: new Date().toISOString() })
                            .eq('student_id', student_id)
                            .eq('course_id', course_id);

                        return h.response({
                            message: 'Flashcards berhasil digenerate',
                            status: 'done',
                        }).code(200);
                    } else {
                        await supabase
                            .from('student_flashcard_status')
                            .update({ status: 'failed', updated_at: new Date().toISOString() })
                            .eq('student_id', student_id)
                            .eq('course_id', course_id);

                        return Boom.badData('Gagal membuat flashcards. Tidak ada konten tersedia.');
                    }

                } catch (err) {
                    //console.error('❌ Error:', err.message);
                    await supabase.from('student_flashcard_status').update({
                        status: 'failed', updated_at: new Date().toISOString()
                    }).eq('student_id', student_id).eq('course_id', course_id);
                    return Boom.internal('Gagal generate flashcards.');
                }
            },
        });
    },

}