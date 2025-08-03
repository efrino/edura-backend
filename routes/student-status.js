const Joi = require('joi');
const Boom = require('@hapi/boom');
const supabase = require('../db');
const { requireRole } = require('../utils/middleware');

module.exports = {
    name: 'student-course-status',
    version: '1.0.0',
    register: async function (server) {
        server.route({
            method: 'GET',
            path: '/student/courses/{courseId}/status',
            options: {
                auth: 'jwt',
                pre: [requireRole('student')],
                tags: ['api', 'Course'],
                description: 'Get student progress and final exam status for a course',
                validate: {
                    params: Joi.object({
                        courseId: Joi.string().uuid().required()
                    })
                }
            },
            handler: async (request, h) => {
                const student_id = request.auth.credentials.id;
                const { courseId } = request.params;

                // Ambil progress student
                const { data: progress, error: progressError } = await supabase
                    .from('student_courses')
                    .select('checkpoint, is_completed')
                    .eq('student_id', student_id)
                    .eq('course_id', courseId)
                    .single();

                if (progressError || !progress) {
                    //console.error(progressError);
                    throw Boom.notFound('Progress student tidak ditemukan');
                }

                // Hitung total sesi dari course
                const { count: totalSessions, error: sessionError } = await supabase
                    .from('course_sessions')
                    .select('id', { count: 'exact', head: true })
                    .eq('course_id', courseId);

                if (sessionError) {
                    //console.error(sessionError);
                    throw Boom.internal('Gagal mengambil jumlah sesi');
                }

                const percentage = Math.round((progress.checkpoint / totalSessions) * 100);
                const canTakeFinal = progress.checkpoint === totalSessions;

                // Cek apakah sudah ada final exam untuk student ini
                const { data: exam, error: examError } = await supabase
                    .from('student_finalexams')
                    .select('id, created_at')
                    .eq('student_id', student_id)
                    .eq('course_id', courseId)
                    .maybeSingle();

                if (examError) {
                    //console.error(examError);
                    throw Boom.internal('Gagal mengambil status final exam');
                }

                return h.response({
                    checkpoint: progress.checkpoint,
                    is_completed: progress.is_completed,
                    total_sessions: totalSessions,
                    percentage,
                    final_exam: {
                        available: canTakeFinal,
                        generated: !!exam,
                        created_at: exam?.created_at || null
                    }
                }).code(200);
            }
        });
    }
};
