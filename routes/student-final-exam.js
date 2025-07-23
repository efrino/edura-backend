
// === routes/student-final-exam.js ===
const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');
const { getNextModel } = require('../utils/geminiClient');
const Boom = require('@hapi/boom');

module.exports = {
    name: 'student-final-exam',
    version: '1.0.0',
    register: async function (server, options) {

        // GET final exam
        server.route({
            method: 'GET',
            path: '/student/final-exam',
            options: {
                tags: ['api', 'Student', 'Final Exam'],
                description: 'Cek apakah student sudah punya final exam dan checkpoint = 16',
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
                    const { data: progress, error: progressErr } = await supabase
                        .from('student_courses')
                        .select('checkpoint')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (progressErr) throw progressErr;
                    if (!progress || progress.checkpoint !== 16) {
                        return Boom.forbidden('Selesaikan semua sesi terlebih dahulu');
                    }

                    const { data: exam, error: examErr } = await supabase
                        .from('student_finalexams')
                        .select('questions, created_at')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (examErr) throw examErr;
                    if (!exam) return Boom.notFound('Final exam belum tersedia');

                    return h.response({
                        message: 'Final exam ditemukan',
                        data: exam,
                    });
                } catch (err) {
                    // console.error('🔥 Error fetching final exam:', err);
                    return Boom.internal('Gagal mengambil data final exam');
                }
            },
        });
        server.route({
            method: 'GET',
            path: '/student/final-exam/status',
            options: {
                tags: ['api', 'Student', 'Final Exam'],
                description: 'Check final exam generation status for a course',
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
                        .from('student_finalexam_status')
                        .select('status, updated_at')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (error) throw error;

                    if (!data) {
                        return h.response({
                            status: 'not_started',
                            message: 'Belum ada proses generate final exam dimulai.',
                        });
                    }

                    return h.response({
                        status: data.status,
                        updated_at: data.updated_at,
                    });
                } catch (err) {
                    // console.error('🔥 Error checking final exam status:', err);
                    return Boom.internal('Gagal memeriksa status final exam');
                }
            },
        });

        // POST generate final exam
        server.route({
            method: 'POST',
            path: '/student/final-exam/generate',
            options: {
                tags: ['api', 'Student', 'Final Exam'],
                description: 'Generate final exam untuk student (async-style)',
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
                    const { data: progress } = await supabase
                        .from('student_courses')
                        .select('checkpoint')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (!progress || progress.checkpoint !== 16) {
                        return Boom.forbidden('Belum menyelesaikan semua sesi.');
                    }

                    const { data: statusRow } = await supabase
                        .from('student_finalexam_status')
                        .select('status')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (statusRow?.status === 'generating') {
                        return Boom.badRequest('Final exam sedang diproses. Silakan tunggu.');
                    }

                    // Tandai sebagai generating
                    await supabase
                        .from('student_finalexam_status')
                        .upsert({
                            student_id,
                            course_id,
                            status: 'generating',
                            updated_at: new Date().toISOString(),
                        }, {
                            onConflict: 'student_id,course_id',
                        });

                    // Simulasi async (tanpa worker, pakai setTimeout)
                    setTimeout(async () => {
                        try {
                            let questions = [];

                            const { data: stok } = await supabase
                                .from('course_finalexams')
                                .select('questions')
                                .eq('course_id', course_id)
                                .maybeSingle();

                            if (stok?.questions?.length >= 30) {
                                questions = stok.questions;
                            } else {
                                const { data: sessions } = await supabase
                                    .from('course_sessions')
                                    .select('title, content')
                                    .eq('course_id', course_id);

                                const model = getNextModel();
                                const prompt = `
Kamu adalah AI pengajar. Buatkan 30 soal final exam pilihan ganda dalam format JSON:
[
  {
    "question": "Apa itu ...?",
    "options": ["string", "string", "string", "string"],
    "answer": "string"
  }
]
Gabungkan seluruh materi berikut:\n\n${sessions.map(s => `Judul: ${s.title}\nMateri: ${s.content}`).join('\n\n')}
            `;

                                const result = await model.generateContent({
                                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                                });

                                const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                let parsed = [];

                                try {
                                    const match = text.match(/\[\s*{[\s\S]*?}\s*\]/);
                                    if (!match) throw new Error('Format JSON tidak ditemukan');
                                    parsed = JSON.parse(match[0]);
                                } catch (err) {
                                    throw Boom.badData('Gagal parsing soal: ' + err.message);
                                }

                                if (!Array.isArray(parsed) || parsed.length < 30) {
                                    throw Boom.badData('Jumlah soal tidak mencukupi');
                                }

                                questions = parsed;

                                await supabase.from('course_finalexams').upsert({
                                    course_id,
                                    questions,
                                    created_at: new Date().toISOString(),
                                }, { onConflict: 'course_id' });
                            }

                            const selected = questions.sort(() => 0.5 - Math.random()).slice(0, 20);

                            await supabase.from('student_finalexams').insert({
                                student_id,
                                course_id,
                                questions: selected,
                                created_at: new Date().toISOString(),
                            });

                            await supabase
                                .from('student_finalexam_status')
                                .update({ status: 'done', updated_at: new Date().toISOString() })
                                .eq('student_id', student_id)
                                .eq('course_id', course_id);

                        } catch (err) {
                            // console.error('❌ Final exam async failed:', err);
                            await supabase
                                .from('student_finalexam_status')
                                .update({ status: 'failed', updated_at: new Date().toISOString() })
                                .eq('student_id', student_id)
                                .eq('course_id', course_id);
                        }
                    }, 1000); // Delay 1 detik

                    return h.response({
                        message: 'Proses generate final exam dimulai.',
                        status: 'generating',
                    }).code(202);
                } catch (err) {
                    // console.error('🔥 Error starting final exam:', err);
                    return Boom.internal('Gagal memulai proses final exam');
                }
            },
        });
        // PUT /student/final-exam/submit
        server.route({
            method: 'PUT',
            path: '/student/final-exam/submit',
            options: {
                tags: ['api', 'Student', 'Final Exam'],
                description: 'Submit final exam dan hitung skor',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    payload: Joi.object({
                        course_id: Joi.string().required(),
                        answers: Joi.array().items(
                            Joi.object({
                                question: Joi.string().required(),
                                answer: Joi.string().required()
                            })
                        ).min(1).required()
                    }),
                },
            },
            handler: async (req, h) => {
                const { course_id, answers } = req.payload;
                const student_id = req.auth.credentials.id;

                try {
                    // Cek apakah sudah submit sebelumnya
                    const { data: submitted } = await supabase
                        .from('student_finalexam_results')
                        .select('id')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (submitted) {
                        return Boom.badRequest('Final exam sudah disubmit sebelumnya');
                    }

                    // Ambil soal
                    const { data: exam, error: examErr } = await supabase
                        .from('student_finalexams')
                        .select('questions')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (examErr) throw examErr;
                    if (!exam || !Array.isArray(exam.questions)) {
                        return Boom.notFound('Final exam belum tersedia');
                    }

                    const answerMap = new Map(answers.map(a => [a.question.trim(), a.answer.trim()]));
                    let correct = 0;

                    for (const q of exam.questions) {
                        const userAnswer = answerMap.get(q.question.trim());
                        const correctLetter = q.answer?.trim().toUpperCase();
                        const correctOptionIndex = ['A', 'B', 'C', 'D'].indexOf(correctLetter);
                        const correctOption = q.options?.[correctOptionIndex]?.trim();

                        if (
                            userAnswer?.toUpperCase() === correctLetter ||
                            userAnswer?.trim().toLowerCase() === correctOption?.toLowerCase()
                        ) {
                            correct += 1;
                        }
                    }

                    const total = exam.questions.length;
                    const score = Math.round((correct / total) * 100);

                    // Simpan hasil ke tabel baru
                    const { error: insertResultErr } = await supabase
                        .from('student_finalexam_results')
                        .insert({
                            student_id,
                            course_id,
                            correct,
                            total,
                            score,
                            submitted_at: new Date().toISOString(),
                        });

                    if (insertResultErr) throw insertResultErr;

                    // Update is_completed di student_courses
                    await supabase
                        .from('student_courses')
                        .update({
                            is_completed: true,
                            updated_at: new Date().toISOString()
                        })
                        .eq('student_id', student_id)
                        .eq('course_id', course_id);

                    return h.response({
                        message: 'Final exam submitted successfully',
                        total_questions: total,
                        correct,
                        score
                    });
                } catch (err) {
                    // console.error('🔥 Error submitting final exam:', err);
                    return Boom.internal('Gagal submit final exam');
                }
            }
        });
        server.route({
            method: 'GET',
            path: '/student/final-exam/result',
            options: {
                tags: ['api', 'Student', 'Final Exam'],
                description: 'Ambil hasil final exam',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    query: Joi.object({
                        course_id: Joi.string().required()
                    }),
                },
            },
            handler: async (req, h) => {
                const { course_id } = req.query;
                const student_id = req.auth.credentials.id;

                try {
                    const { data, error } = await supabase
                        .from('student_finalexam_results')
                        .select('*')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (error) throw error;
                    if (!data) return Boom.notFound('Belum ada hasil');

                    return h.response({
                        message: 'Hasil final exam ditemukan',
                        result: data
                    });
                } catch (err) {
                    // console.error('🔥 Error fetching final exam result:', err);
                    return Boom.internal('Gagal mengambil hasil final exam');
                }
            }
        });
        server.route({
            method: 'GET',
            path: '/student/final-exam/leaderboard',
            options: {
                tags: ['api', 'Student', 'Final Exam'],
                description: 'Leaderboard siswa dalam satu kelas berdasarkan nilai akhir',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    query: Joi.object({
                        course_id: Joi.string().required(),
                        class_id: Joi.string().required(),
                    }),
                },
            },
            handler: async (req, h) => {
                const { course_id, class_id } = req.query;
                const current_user_id = req.auth.credentials.id; // Get current user ID

                try {
                    // Ambil semua hasil final exam yang sudah submit
                    const { data: results, error } = await supabase
                        .from('student_finalexam_results')
                        .select('student_id, score, submitted_at')
                        .eq('course_id', course_id)
                        .order('score', { ascending: false })
                        .order('submitted_at', { ascending: true }); // Secondary sort by submission time

                    if (error) throw error;

                    const studentIds = results.map(r => r.student_id);

                    // Ambil profil siswa dalam kelas tersebut
                    const { data: profiles, error: profileErr } = await supabase
                        .from('student_profiles')
                        .select('user_id, full_name')
                        .in('user_id', studentIds)
                        .eq('class_id', class_id);

                    if (profileErr) throw profileErr;

                    const profileMap = new Map(profiles.map(p => [p.user_id, p.full_name]));

                    // Gabungkan dan filter hanya yang ada di kelas
                    const leaderboard = results
                        .filter(r => profileMap.has(r.student_id))
                        .map((r, idx) => ({
                            rank: idx + 1,
                            student_id: r.student_id, // Include student_id for frontend identification
                            name: profileMap.get(r.student_id),
                            score: r.score,
                            submitted_at: r.submitted_at,
                            isCurrentUser: r.student_id === current_user_id // Flag untuk current user
                        }));

                    return h.response({
                        message: 'Leaderboard berhasil diambil',
                        total_participants: leaderboard.length,
                        leaderboard,
                        current_user_rank: leaderboard.find(entry => entry.isCurrentUser)?.rank || null
                    });
                } catch (err) {
                    console.error('🔥 Error leaderboard:', err);
                    return Boom.internal('Gagal mengambil leaderboard');
                }
            },
        });


    }
};
