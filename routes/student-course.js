const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');

module.exports = {
    name: 'student-courses',
    version: '1.0.0',
    register: async function (server, options) {
        // === GET /student/courses ===
        server.route({
            method: 'GET',
            path: '/student/courses',
            options: {
                tags: ['api', 'Student'],
                description: 'Get student enrolled courses with progress',
                pre: [verifyToken, requireRole('student')],
            },
            handler: async (request, h) => {
                const studentId = request.auth.credentials.id;

                const { data, error } = await supabase
                    .from('student_courses')
                    .select(`
            course_id,
            checkpoint,
            is_completed,
            courses (
              title,
              level,
              course_sessions(count)
            )
          `)
                    .eq('student_id', studentId);

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal mengambil data course' }).code(500);
                }

                const result = data.map(item => ({
                    course_id: item.course_id,
                    title: item.courses.title,
                    level: item.courses.level,
                    checkpoint: item.checkpoint,
                    is_completed: item.is_completed,
                    total_sessions: item.courses.course_sessions.length,
                }));

                return h.response(result).code(200);
            },
        });

        // === PUT /student/courses/{courseId}/checkpoint ===
        server.route({
            method: 'PUT',
            path: '/student/courses/{courseId}/checkpoint',
            options: {
                tags: ['api', 'Student'],
                description: 'Update checkpoint progress student',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    payload: Joi.object({
                        checkpoint: Joi.number().integer().min(1).max(16).required(),
                    }),
                    params: Joi.object({
                        courseId: Joi.string().guid().required(),
                    }),
                },
            },
            handler: async (request, h) => {
                const studentId = request.auth.credentials.id;
                const { courseId } = request.params;
                const { checkpoint } = request.payload;

                const { count, error: sessionError } = await supabase
                    .from('course_sessions')
                    .select('id', { count: 'exact', head: true })
                    .eq('course_id', courseId);

                if (sessionError) {
                    console.error(sessionError);
                    return h.response({ message: 'Gagal mengambil data sesi' }).code(500);
                }

                if (checkpoint > count) {
                    return h.response({ message: 'Checkpoint melebihi jumlah sesi' }).code(400);
                }

                const { error: updateError } = await supabase
                    .from('student_courses')
                    .update({
                        checkpoint,
                        is_completed: checkpoint === count,
                    })
                    .eq('student_id', studentId)
                    .eq('course_id', courseId);

                if (updateError) {
                    console.error(updateError);
                    return h.response({ message: 'Gagal update checkpoint' }).code(500);
                }

                return h.response({ message: 'Progress berhasil diperbarui' }).code(200);
            },
        });
    },
};
