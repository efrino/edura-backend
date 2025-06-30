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

                // Step 1: Get enrolled courses
                const { data: enrolledCourses, error: enrolledError } = await supabase
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
                    verified_by
                )
            `)
                    .eq('student_id', studentId);

                if (enrolledError) {
                    console.error(enrolledError);
                    return h.response({ message: 'Gagal mengambil data course' }).code(500);
                }

                // Step 2: Ambil semua kombinasi unik untuk filter
                const uniqueFilters = Array.from(
                    new Set(
                        enrolledCourses.map(ec => JSON.stringify({
                            subject: ec.courses.subject,
                            level: ec.courses.level,
                            program_studi: ec.courses.program_studi
                        }))
                    )
                ).map(f => JSON.parse(f));

                let allCourses = [];

                // Step 3: Ambil semua courses yang cocok
                for (const filter of uniqueFilters) {
                    const { data: matchedCourses, error } = await supabase
                        .from('courses')
                        .select(`
                    id,
                    title,
                    level,
                    subject,
                    program_studi,
                    is_verified,
                    verified_by
                `)
                        .eq('subject', filter.subject)
                        .eq('level', filter.level)
                        .eq('program_studi', filter.program_studi)
                        .eq('is_verified', true);

                    if (error) {
                        console.error(error);
                        continue;
                    }

                    allCourses.push(...matchedCourses);
                }

                // Step 4: Ambil jumlah sesi dari semua course
                const courseIds = allCourses.map(course => course.id);
                const { data: sessions, error: sessionsError } = await supabase
                    .from('course_sessions')
                    .select('course_id')
                    .in('course_id', courseIds);

                if (sessionsError) {
                    console.error(sessionsError);
                    return h.response({ message: 'Gagal mengambil sesi course' }).code(500);
                }

                // Hitung total sesi per course
                const sessionCounts = {};
                for (const s of sessions) {
                    sessionCounts[s.course_id] = (sessionCounts[s.course_id] || 0) + 1;
                }

                const enrolledMap = {};
                for (const ec of enrolledCourses) {
                    enrolledMap[ec.course_id] = ec;
                }

                // Step 5: Gabungkan semua data
                const results = allCourses.map(course => {
                    const enrolled = enrolledMap[course.id];
                    const totalSessions = sessionCounts[course.id] || 0;

                    const checkpoint = enrolled?.checkpoint ?? 0;
                    const percentage = totalSessions > 0
                        ? Math.round((checkpoint / totalSessions) * 100)
                        : 0;

                    return {
                        course_id: course.id,
                        title: course.title,
                        level: course.level,
                        subject: course.subject,
                        program_studi: course.program_studi,
                        is_verified: course.is_verified || false,
                        verified_by: course.verified_by || null,
                        is_enrolled: !!enrolled,
                        checkpoint,
                        is_completed: enrolled?.is_completed ?? false,
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
