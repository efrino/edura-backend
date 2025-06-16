const Joi = require('joi');
const Boom = require('@hapi/boom');
const supabase = require('../db');
const { model } = require('../utils/geminiClient');
const { requireRole } = require('../utils/middleware');

function getRandomSubset(array, count = 10) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

module.exports = {
    name: 'final-exam-routes',
    register: async function (server) {
        server.route([
            {
                method: 'POST',
                path: '/final-exam/generate',
                options: {
                    auth: 'jwt',
                    pre: [requireRole('student')],
                    tags: ['api', 'Final-Exam'],
                    validate: {
                        payload: Joi.object({
                            course_id: Joi.string().uuid().required(),
                        }),
                    },
                },
                handler: async (request, h) => {
                    const { course_id } = request.payload;
                    const student_id = request.auth.credentials.id;

                    // 1. Pastikan student sudah menyelesaikan sesi ke-16
                    const { data: studentCourse, error: scError } = await supabase
                        .from('student_courses')
                        .select('*')
                        .eq('course_id', course_id)
                        .eq('student_id', student_id)
                        .single();

                    if (scError || !studentCourse) {
                        console.error(scError);
                        throw Boom.notFound('Student course not found');
                    }

                    if (studentCourse.checkpoint < 16) {
                        throw Boom.forbidden('Final exam cannot be generated before completing all sessions');
                    }

                    // 2. Ambil template soal dari course_finalexams (jika sudah ada)
                    let questionsTemplate;
                    const { data: existingTemplate, error: templateError } = await supabase
                        .from('course_finalexams')
                        .select('*')
                        .eq('course_id', course_id)
                        .maybeSingle();

                    if (templateError) {
                        console.error(templateError);
                        throw Boom.internal('Error checking final exam template');
                    }

                    if (!existingTemplate) {
                        // 3. Ambil semua sesi course
                        const { data: sessions, error: sessErr } = await supabase
                            .from('course_sessions')
                            .select('session_number, title, content')
                            .eq('course_id', course_id)
                            .order('session_number', { ascending: true });

                        if (sessErr || !sessions || sessions.length === 0) {
                            throw Boom.notFound('Course sessions not found');
                        }

                        const prompt = sessions.map(
                            (s) => `Session ${s.session_number}: ${s.title}\n${s.content}`
                        ).join('\n\n');

                        try {
                            const result = await model.generateContent(
                                `Buatkan 50 soal pilihan ganda berbasis materi berikut:\n\n${prompt}\n\nFormat:\n[\n  {\n    "question": "...",\n    "choices": ["A", "B", "C", "D"],\n    "answer": "A"\n  }, ...\n]`
                            );
                            const response = await result.response;
                            const text = await response.text();
                            questionsTemplate = JSON.parse(text);
                        } catch (err) {
                            console.error('❌ Gemini error:', err);
                            throw Boom.internal('Failed to generate final exam questions');
                        }

                        const { error: insertTemplateError } = await supabase
                            .from('course_finalexams')
                            .insert({ course_id, questions: questionsTemplate });

                        if (insertTemplateError) {
                            console.error(insertTemplateError);
                            throw Boom.internal('Failed to save final exam template');
                        }
                    } else {
                        questionsTemplate = existingTemplate.questions;
                    }

                    // 4. Cek apakah student sudah punya final exam
                    const { data: existingStudentExam, error: studentExamError } = await supabase
                        .from('student_finalexams')
                        .select('*')
                        .eq('course_id', course_id)
                        .eq('student_id', student_id)
                        .maybeSingle();

                    if (studentExamError) {
                        console.error(studentExamError);
                        throw Boom.internal('Error checking student final exam');
                    }

                    if (existingStudentExam) {
                        return h.response({ message: 'Final exam already generated for this student', exam: existingStudentExam }).code(200);
                    }

                    // 5. Ambil 10 random soal dari 50
                    const selectedQuestions = getRandomSubset(questionsTemplate, 10);

                    // 6. Simpan ke student_finalexams
                    const { data: savedExam, error: saveError } = await supabase
                        .from('student_finalexams')
                        .insert({
                            student_id,
                            course_id,
                            questions: selectedQuestions,
                        })
                        .select()
                        .single();

                    if (saveError) {
                        console.error(saveError);
                        throw Boom.internal('Failed to save student final exam');
                    }

                    return h.response({ message: 'Final exam generated successfully', exam: savedExam }).code(201);
                },
            },
        ]);
    },
};
