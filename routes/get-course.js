const { verifyToken, requireRole } = require('../utils/middleware');
const supabase = require('../db');

module.exports = {
    name: 'get-course',
    version: '1.0.0',
    register: async function (server, options) {
        server.route({
            method: 'GET',
            path: '/student/course/recommendations',
            options: {
                tags: ['api', 'Course'],
                description: 'Get recommended course titles for student by program studi (yang belum pernah diambil)',
                pre: [verifyToken, requireRole('student')]
            },
            handler: async (request, h) => {
                const userId = request.auth.credentials.id;

                // Ambil program studi student
                const { data: profile, error: profileError } = await supabase
                    .from('student_profiles')
                    .select('program_studi')
                    .eq('user_id', userId)
                    .single();

                if (profileError || !profile) {
                    return h.response({ message: 'Profil student tidak ditemukan' }).code(404);
                }

                const programStudi = profile.program_studi;

                // Ambil course_id yang sudah diambil student
                const { data: takenCourses, error: takenError } = await supabase
                    .from('student_courses')
                    .select('course_id')
                    .eq('student_id', userId);

                if (takenError) {
                    console.error(takenError);
                    return h.response({ message: 'Gagal mengambil data student_courses' }).code(500);
                }

                const takenIds = takenCourses.map(c => `'${c.course_id}'`);

                // Query semua course (verified & unverified) sesuai program studi dan belum pernah diambil
                let query = supabase
                    .from('courses')
                    .select('title, is_verified')
                    .eq('program_studi', programStudi);

                if (takenIds.length > 0) {
                    query = query.not('id', 'in', `(${takenIds.join(',')})`);
                }

                const { data: courses, error: courseError } = await query;

                if (courseError) {
                    console.error(courseError);
                    return h.response({ message: 'Gagal mengambil rekomendasi course' }).code(500);
                }

                const titles = courses.map(c => ({
                    title: c.title,
                    is_verified: c.is_verified
                }));

                return h.response({
                    message: 'Rekomendasi course ditemukan',
                    titles
                });
            }
        });
    }
};
