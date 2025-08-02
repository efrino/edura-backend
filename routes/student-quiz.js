const Joi = require('joi');
const Boom = require('@hapi/boom');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');
const { getNextModel } = require('../utils/geminiClient');

module.exports = {
    name: 'student-quiz',
    version: '1.0.0',
    register: async function (server) {
        // ✅ GET: Ambil quiz siswa
        // Di backend, update validasi GET /student/quiz untuk mengizinkan parameter tambahan
        server.route({
            method: 'GET',
            path: '/student/quiz',
            options: {
                tags: ['api', 'Student', 'Quiz'],
                description: 'Get student quiz for a specific course and session',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    query: Joi.object({
                        course_id: Joi.string().required(),
                        session_number: Joi.number().min(1).max(16).required(),
                    }).unknown(true), // Atau gunakan .unknown(true) untuk mengizinkan parameter tambahan
                },
            },
            handler: async (req, h) => {
                const { course_id, session_number } = req.query;
                const student_id = req.auth.credentials.id;

                const { data, error } = await supabase
                    .from('student_quizzes')
                    .select('questions, status, created_at, updated_at')
                    .eq('student_id', student_id)
                    .eq('course_id', course_id)
                    .eq('session_number', session_number)
                    .maybeSingle();

                if (error) {
                    console.error(error);
                    return Boom.internal('Failed to fetch student quiz');
                }

                if (!data) return Boom.notFound('Quiz not found for this session');
                return h.response({ message: 'Quiz found', data });
            },
        });

        // ✅ POST: Generate quiz untuk siswa
        server.route({
            method: 'POST',
            path: '/student/quiz/generate',
            options: {
                tags: ['api', 'Student', 'Quiz'],
                description: 'Generate quiz (5 soal multiple choice) for a student per session.',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    payload: Joi.object({
                        course_id: Joi.string().required(),
                        session_number: Joi.number().min(1).max(16).required(),
                        _t: Joi.number().optional(), // Tambahkan parameter ini untuk cache busting
                    }),
                },
            },
            handler: async (req, h) => {
                const { course_id, session_number } = req.payload;
                const student_id = req.auth.credentials.id;

                const timestamp = new Date().toISOString();

                try {
                    // Cek jika student sudah punya quiz
                    const { data: existing } = await supabase
                        .from('student_quizzes')
                        .select('status')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .eq('session_number', session_number)
                        .maybeSingle();

                    if (existing) {
                        return h.response({
                            message: `Quiz already exists with status: ${existing.status}`,
                            status: 'skipped',
                        });
                    }

                    // Insert status awal "generating"
                    await supabase.from('student_quizzes').insert({
                        student_id,
                        course_id,
                        session_number,
                        questions: [],
                        status: 'generating',
                        created_at: timestamp,
                        updated_at: timestamp,
                    });

                    // Ambil sesi materi
                    const { data: session } = await supabase
                        .from('course_sessions')
                        .select('title, content')
                        .eq('course_id', course_id)
                        .eq('session_number', session_number)
                        .maybeSingle();

                    if (!session) throw Boom.notFound('Course session not found');

                    const model = getNextModel();

                    // Cek dan reuse course_quizzes jika sudah tersedia
                    let courseQuestions = [];

                    const { data: existingQuiz } = await supabase
                        .from('course_quizzes')
                        .select('questions')
                        .eq('course_id', course_id)
                        .eq('session_number', session_number)
                        .maybeSingle();

                    if (existingQuiz && Array.isArray(existingQuiz.questions) && existingQuiz.questions.length >= 5) {
                        courseQuestions = existingQuiz.questions;
                    } else {
                        // Generate quiz baru pakai Gemini
                        const prompt = `
Buatkan 5 soal pilihan ganda dalam format JSON:
[
  {
    "question": "Apa itu ...?",
    "options": ["string", "string", "string", "string"],
    "answer": "string"
  },
  ...
]
Materi: ${session.title}
Konten: ${session.content}
`;

                        const result = await model.generateContent({
                            contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        });

                        const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        const jsonMatch = text.match(/\[\s*{[\s\S]*?}\s*\]/);

                        try {
                            if (jsonMatch) {
                                courseQuestions = JSON.parse(jsonMatch[0]).slice(0, 5);

                                await supabase.from('course_quizzes').upsert({
                                    course_id,
                                    session_number,
                                    questions: courseQuestions,
                                    created_at: timestamp,
                                }, {
                                    onConflict: 'course_id,session_number',
                                });
                            } else {
                                throw new Error('Invalid JSON structure');
                            }
                        } catch (e) {
                            // Update jadi failed
                            await supabase.from('student_quizzes')
                                .update({ status: 'failed', updated_at: new Date().toISOString() })
                                .match({ student_id, course_id, session_number });

                            console.error(`❌ Failed to parse or save AI quiz:`, e.message);
                            throw Boom.badData('Quiz generation failed, try again later');
                        }
                    }

                    // Random ambil 2 dari 5 soal (bisa disesuaikan)
                    const randomized = courseQuestions.sort(() => 0.5 - Math.random()).slice(0, 2);

                    // Update quiz siswa dengan soal final
                    await supabase.from('student_quizzes')
                        .update({
                            questions: randomized,
                            status: 'done',
                            updated_at: new Date().toISOString(),
                        })
                        .match({ student_id, course_id, session_number });

                    return h.response({
                        message: 'Student quiz generated successfully',
                        total_questions: randomized.length,
                    });
                } catch (err) {
                    console.error('🔥 Error generating student quiz:', err);
                    return Boom.internal('Failed to generate quiz');
                }
            },
        });

        // REVISI ROUTE PUT /submit
        server.route({
            method: 'PUT',
            path: '/student/quiz/submit',
            options: {
                tags: ['api', 'Student', 'Quiz'],
                description: 'Submit student quiz answers and get score, supports retry',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    payload: Joi.object({
                        course_id: Joi.string().uuid().required(),
                        session_number: Joi.number().min(1).max(16).required(),
                        // Validasi kondisional: answers wajib jika retry=false
                        answers: Joi.when('retry', {
                            is: Joi.valid(true),
                            then: Joi.array().items(Joi.object()).optional(), // Boleh kosong saat retry
                            otherwise: Joi.array().items(
                                Joi.object({
                                    question: Joi.string().required(),
                                    selected: Joi.string().allow('').required(),
                                })
                            ).min(1).required(),
                        }),
                        retry: Joi.boolean().default(false),
                    }),
                },
            },
            handler: async (req, h) => {
                const student_id = req.auth.credentials.id;
                const { course_id, session_number, answers, retry } = req.payload;

                try {
                    const { data: quizData, error: quizErr } = await supabase
                        .from('student_quizzes')
                        .select('id, questions, status')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .eq('session_number', session_number)
                        .maybeSingle();

                    if (quizErr || !quizData) {
                        return Boom.notFound('Quiz not found for this student and session');
                    }

                    // --- LOGIKA RETRY BARU ---
                    if (retry) {
                        if (quizData.status !== 'submitted') {
                            return Boom.badRequest('Cannot retry a quiz that has not been submitted.');
                        }

                        // Ambil bank soal dari course_quizzes
                        const { data: courseQuiz } = await supabase
                            .from('course_quizzes')
                            .select('questions')
                            .eq('course_id', course_id)
                            .eq('session_number', session_number)
                            .maybeSingle();

                        if (!courseQuiz || !courseQuiz.questions || courseQuiz.questions.length === 0) {
                            return Boom.notFound('Course quiz bank not found for retry.');
                        }

                        // Acak ulang soal
                        const newQuestions = courseQuiz.questions
                            .sort(() => 0.5 - Math.random())
                            .slice(0, 2); // Ambil 2 soal acak

                        // Reset kuis mahasiswa
                        const { error: resetErr } = await supabase
                            .from('student_quizzes')
                            .update({
                                questions: newQuestions,
                                answers: null,
                                score: null,
                                status: 'done', // Status kembali ke 'done' (siap dikerjakan)
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', quizData.id);

                        if (resetErr) {
                            console.error('❌ Failed to reset quiz:', resetErr);
                            return Boom.internal('Failed to reset quiz.');
                        }

                        // **PENTING: Kembalikan soal baru ke frontend**
                        return h.response({
                            message: 'Quiz has been reset. Please proceed.',
                            status: 'reset',
                            data: {
                                questions: newQuestions // Kirim soal baru
                            }
                        });
                    }

                    // --- LOGIKA SUBMIT BIASA ---
                    if (quizData.status === 'submitted') {
                        return Boom.conflict('Quiz has already been submitted. Use retry=true to try again.');
                    }

                    const correctQuestions = quizData.questions;
                    let correctCount = 0;
                    for (const studentAnswer of answers) {
                        const q = correctQuestions.find(item => item.question === studentAnswer.question);
                        if (q && q.answer.trim().toLowerCase() === studentAnswer.selected.trim().toLowerCase()) {
                            correctCount++;
                        }
                    }

                    const total = correctQuestions.length;
                    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

                    const { error: updateErr } = await supabase
                        .from('student_quizzes')
                        .update({
                            answers,
                            score,
                            status: 'submitted',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', quizData.id);

                    if (updateErr) {
                        return Boom.internal('Failed to update quiz result');
                    }

                    return h.response({
                        message: '✅ Quiz submitted successfully',
                        data: { correct: correctCount, total, score }
                    });

                } catch (err) {
                    console.error('❌ Failed to submit quiz:', err);
                    return Boom.internal('An unexpected error occurred while submitting the quiz.');
                }
            }
        });
        server.route({
            method: 'GET',
            path: '/student/quiz/result',
            options: {
                tags: ['api', 'Student', 'Quiz'],
                description: 'Get student quiz result for a specific course and session',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    query: Joi.object({
                        course_id: Joi.string().required(),
                        session_number: Joi.number().min(1).max(16).required(),
                        _t: Joi.number().optional(), // Tambahkan parameter ini untuk cache busting
                    })
                }
            },
            handler: async (req, h) => {
                const student_id = req.auth.credentials.id;
                const { course_id, session_number } = req.query;

                try {
                    const { data: quiz, error } = await supabase
                        .from('student_quizzes')
                        .select('questions, answers, score, status, created_at, updated_at')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .eq('session_number', session_number)
                        .maybeSingle();

                    if (error || !quiz) {
                        console.error(error);
                        return Boom.notFound('Quiz result not found');
                    }

                    return h.response({
                        message: '✅ Quiz result fetched successfully',
                        data: {
                            questions: quiz.questions,
                            answers: quiz.answers || [],
                            score: quiz.score ?? null,
                            status: quiz.status,
                            created_at: quiz.created_at,
                            updated_at: quiz.updated_at
                        }
                    });
                } catch (err) {
                    console.error('❌ Error fetching quiz result:', err);
                    return Boom.internal('Failed to fetch quiz result');
                }
            }
        });
    },
}