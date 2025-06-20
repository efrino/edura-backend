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
                description: 'Get recommended course subjects and levels not yet taken (with is_verified info)',
                pre: [verifyToken, requireRole('student')]
            },
            handler: async (request, h) => {
                const userId = request.auth.credentials.id;

                // 1. Ambil program studi student
                const { data: profile, error: profileError } = await supabase
                    .from('student_profiles')
                    .select('program_studi')
                    .eq('user_id', userId)
                    .single();

                if (profileError || !profile) {
                    return h.response({ message: 'Profil student tidak ditemukan' }).code(404);
                }

                const programStudi = profile.program_studi;

                // 2. Ambil plan user
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('plan')
                    .eq('id', userId)
                    .single();

                if (userError || !userData) {
                    console.error(userError);
                    return h.response({ message: 'Gagal mengambil data user' }).code(500);
                }

                const isFreePlan = userData.plan === 'free';

                // 3. Ambil course_id yang sudah diambil student
                const { data: takenCourses, error: takenError } = await supabase
                    .from('student_courses')
                    .select('course_id')
                    .eq('student_id', userId);

                if (takenError) {
                    console.error(takenError);
                    return h.response({ message: 'Gagal mengambil data student_courses' }).code(500);
                }

                const takenIds = takenCourses.map(c => c.course_id);
                const courseLimitReached = isFreePlan && takenIds.length >= 5;

                if (courseLimitReached) {
                    return h.response({
                        message: 'Anda telah mengambil maksimal 5 course untuk plan gratis. Silakan upgrade ke premium untuk akses lebih banyak course.'
                    }).code(403);
                }

                // 4. Ambil semua course yang belum diambil (tanpa filter is_verified)
                let query = supabase
                    .from('courses')
                    .select('id, subject, level, is_verified')
                    .eq('program_studi', programStudi);

                if (takenIds.length > 0) {
                    query = query.not('id', 'in', `(${takenIds.join(',')})`);
                }

                const { data: courses, error: courseError } = await query;

                if (courseError) {
                    console.error(courseError);
                    return h.response({ message: 'Gagal mengambil rekomendasi course' }).code(500);
                }

                if (!courses || courses.length === 0) {
                    return h.response({
                        message: 'Tidak ada course baru yang tersedia.',
                        recommendations: []
                    }).code(200);
                }

                // 5. Buat daftar subject+level unik
                const seen = new Set();
                const uniqueRecommendations = [];

                for (const course of courses) {
                    const key = `${course.subject?.toLowerCase()}-${course.level}`;
                    if (!seen.has(key)) {
                        uniqueRecommendations.push({
                            subject: course.subject,
                            level: course.level,
                            is_verified: course.is_verified
                        });
                        seen.add(key);
                    }
                }

                return h.response({
                    message: 'Berikut course yang direkomendasikan untuk Anda',
                    recommendations: uniqueRecommendations
                }).code(200);
            }
        });
    }
};
