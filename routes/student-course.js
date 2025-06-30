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
                tags: ['api', 'Course'],
                description: 'Get student enrolled courses with progress',
                pre: [verifyToken, requireRole('student')],
            },
            handler: async (request, h) => {
                const studentId = request.auth.credentials.id;

                // Ambil semua course yang dimiliki student
                const { data: enrolledCourses, error } = await supabase
                    .from('student_courses')
                    .select(`
                course_id,
                checkpoint,
                is_completed,
                courses (
                    id,
                    title,
                    level,
                    subject,
                    program_studi,
                    is_verified,
                    is_generating,
                    verified_by
                )
            `)
                    .eq('student_id', studentId);

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal mengambil data course' }).code(500);
                }

                // Ambil semua jumlah sesi untuk course yang dimiliki student
                const courseIds = enrolledCourses.map(item => item.course_id);
                const { data: sessions, error: sessionError } = await supabase
                    .from('course_sessions')
                    .select('course_id')
                    .in('course_id', courseIds);

                if (sessionError) {
                    console.error(sessionError);
                    return h.response({ message: 'Gagal mengambil data sesi' }).code(500);
                }

                // Hitung total sesi per course
                const sessionCounts = {};
                for (const s of sessions) {
                    sessionCounts[s.course_id] = (sessionCounts[s.course_id] || 0) + 1;
                }

                // Gabungkan dan siapkan response
                const results = enrolledCourses.map(item => {
                    const course = item.courses;
                    const totalSessions = sessionCounts[item.course_id] || 0;
                    const percentage = totalSessions > 0
                        ? Math.round((item.checkpoint / totalSessions) * 100)
                        : 0;

                    return {
                        course_id: course.id,
                        title: course.title,
                        level: course.level,
                        subject: course.subject,
                        program_studi: course.program_studi,
                        is_verified: course.is_verified,
                        is_generating: course.is_generating,
                        verified_by: course.verified_by,
                        checkpoint: item.checkpoint,
                        is_completed: item.is_completed,
                        total_sessions: totalSessions,
                        percentage
                    };
                });

                return h.response(results).code(200);
            }
        });

        // === PUT /student/courses/{courseId}/checkpoint ===
        server.route({
            method: 'PUT',
            path: '/student/courses/{courseId}/checkpoint',
            options: {
                tags: ['api', 'Course'],
                description: 'Update checkpoint progress student (increment only)',
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

                // Dapatkan total sesi dari course
                const { count, error: sessionError } = await supabase
                    .from('course_sessions')
                    .select('id', { count: 'exact', head: true })
                    .eq('course_id', courseId);

                if (sessionError) {
                    console.error(sessionError);
                    return h.response({ message: 'Gagal mengambil data sesi' }).code(500);
                }

                // Ambil progress student saat ini
                const { data: studentProgress, error: progressError } = await supabase
                    .from('student_courses')
                    .select('checkpoint')
                    .eq('student_id', studentId)
                    .eq('course_id', courseId)
                    .single();

                if (progressError) {
                    console.error(progressError);
                    return h.response({ message: 'Gagal mengambil progres saat ini' }).code(500);
                }

                const currentCheckpoint = studentProgress.checkpoint;

                if (checkpoint <= currentCheckpoint) {
                    return h.response({
                        message: `Anda sudah menyelesaikan chapter ini. Progress Anda saat ini di checkpoint ke-${currentCheckpoint}.`,
                        current_checkpoint: currentCheckpoint,
                        percentage: Math.round((currentCheckpoint / count) * 100)
                    }).code(400);
                }

                if (checkpoint > currentCheckpoint + 1) {
                    return h.response({
                        message: `Tidak bisa melompati chapter. Anda hanya dapat menyelesaikan checkpoint ke-${currentCheckpoint + 1} saat ini.`,
                        current_checkpoint: currentCheckpoint,
                        percentage: Math.round((currentCheckpoint / count) * 100)
                    }).code(400);
                }

                const isCompleted = checkpoint === count;

                const { error: updateError } = await supabase
                    .from('student_courses')
                    .update({
                        checkpoint,
                        is_completed: isCompleted,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('student_id', studentId)
                    .eq('course_id', courseId);

                if (updateError) {
                    console.error(updateError);
                    return h.response({ message: 'Gagal update checkpoint' }).code(500);
                }

                return h.response({
                    message: 'Checkpoint berhasil diperbarui',
                    checkpoint,
                    percentage: Math.round((checkpoint / count) * 100),
                    is_completed: isCompleted
                }).code(200);
            },
        });
    }
};
