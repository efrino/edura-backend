const Joi = require('joi');
const Boom = require('@hapi/boom');
const supabase = require('../db');
const { requireRole } = require('../utils/middleware');

module.exports = {
    name: 'submit-final-exam-routes',
    register: async function (server) {
        server.route([
            {
                method: 'POST',
                path: '/final-exam/submit',
                options: {
                    auth: 'jwt',
                    pre: [requireRole('student')],
                    tags: ['api', 'Final-Exam'],
                    validate: {
                        payload: Joi.object({
                            course_id: Joi.string().uuid().required(),
                            answers: Joi.array().items(
                                Joi.object({
                                    question: Joi.string().required(),
                                    selected: Joi.string().valid('A', 'B', 'C', 'D').required()
                                })
                            ).length(10).required()
                        }),
                    },
                },
                handler: async (request, h) => {
                    const { course_id, answers } = request.payload;
                    const student_id = request.auth.credentials.id;

                    // 1. Ambil final exam milik student
                    const { data: exam, error: examErr } = await supabase
                        .from('student_finalexams')
                        .select('id, questions, submitted_at')
                        .eq('student_id', student_id)
                        .eq('course_id', course_id)
                        .single();

                    if (examErr || !exam) {
                        console.error(examErr);
                        throw Boom.notFound('Student final exam not found');
                    }

                    if (exam.submitted_at) {
                        throw Boom.forbidden('Final exam already submitted');
                    }

                    // 2. Hitung skor (jumlah jawaban benar / 10 * 100)
                    const questionMap = {};
                    for (const q of exam.questions) {
                        questionMap[q.question] = q.answer;
                    }

                    let correctCount = 0;
                    for (const a of answers) {
                        const correct = questionMap[a.question];
                        if (correct && a.selected === correct) {
                            correctCount++;
                        }
                    }

                    const score = (correctCount / 10) * 100;

                    // 3. Update final exam student
                    const { error: updateErr } = await supabase
                        .from('student_finalexams')
                        .update({
                            answers,
                            score,
                            submitted_at: new Date().toISOString(),
                        })
                        .eq('id', exam.id);

                    if (updateErr) {
                        console.error(updateErr);
                        throw Boom.internal('Failed to submit final exam');
                    }

                    return h.response({ message: 'Final exam submitted', score }).code(200);
                },
            },
        ]);
    },
};
