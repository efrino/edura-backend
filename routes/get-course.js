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
                description: 'Get recommended course titles for student by program studi',
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

                // Ambil course yang diverifikasi dan sesuai program studi
                const { data: courses, error: courseError } = await supabase
                    .from('courses')
                    .select('title')
                    .eq('program_studi', programStudi)
                    .eq('is_verified', true)
                    .order('created_at', { ascending: false });

                if (courseError) {
                    console.error(courseError);
                    return h.response({ message: 'Gagal mengambil rekomendasi course' }).code(500);
                }

                // Ambil hanya daftar judul
                const titles = courses.map(c => c.title);

                return h.response({
                    message: 'Rekomendasi course ditemukan',
                    titles
                });
            }
        });
    }
};
