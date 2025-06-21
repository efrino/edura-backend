const Joi = require('joi');
const Boom = require('@hapi/boom');
const supabase = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'student-course-content',
    version: '1.0.0',
    register: async function (server, options) {
        server.route({
            method: 'GET',
            path: '/student/courses/{id}/content',
            options: {
                tags: ['api', 'Course'],
                description: 'Get full course content and eligibility for final exam',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    params: Joi.object({
                        id: Joi.string().uuid().required()
                    })
                }
            },
            handler: async (request, h) => {
                const studentId = request.auth.credentials.id;
                const courseId = request.params.id;

                // 1. Ambil info course
                const { data: course, error: courseError } = await supabase
                    .from('courses')
                    .select('*')
                    .eq('id', courseId)
                    .maybeSingle();

                if (courseError || !course) {
                    console.error(courseError);
                    return Boom.notFound('Course tidak ditemukan');
                }

                // 2. Ambil daftar sesi dari course_sessions
                const { data: sessions, error: sessionError } = await supabase
                    .from('course_sessions')
                    .select('session_number, title, content')
                    .eq('course_id', courseId)
                    .order('session_number', { ascending: true });

                if (sessionError) {
                    console.error(sessionError);
                    return Boom.internal('Gagal mengambil sesi kursus');
                }

                // 3. Ambil data student_courses
                const { data: progress, error: progressError } = await supabase
                    .from('student_courses')
                    .select('checkpoint, is_completed, score_final_exam')
                    .eq('student_id', studentId)
                    .eq('course_id', courseId)
                    .maybeSingle();

                if (progressError || !progress) {
                    console.error(progressError);
                    return Boom.notFound('Data student_course tidak ditemukan');
                }

                // 4. Cek apakah final exam tersedia
                const { data: finalExamTemplate, error: finalExamError } = await supabase
                    .from('course_finalexams')
                    .select('id')
                    .eq('course_id', courseId)
                    .maybeSingle();

                const isEligibleForFinalExam = progress.checkpoint >= 16 && finalExamTemplate;

                return h.response({
                    course: {
                        id: course.id,
                        title: course.title,
                        description: course.description,
                        subject: course.subject,
                        level: course.level,
                        is_verified: course.is_verified
                    },
                    sessions,
                    progress,
                    isEligibleForFinalExam
                });
            }
        });
    }
};
