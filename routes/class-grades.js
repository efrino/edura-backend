const Joi = require('joi');
const Boom = require('@hapi/boom');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'class-grades',
    version: '1.0.0',
    register: async function (server) {
        server.route({
            method: 'GET',
            path: '/teacher/classes/{id}/grades',
            options: {
                tags: ['api', 'Teacher'],
                description: 'Ambil nilai siswa per kelas (kelompok per siswa)',
                pre: [verifyToken, requireRole('teacher')],
                validate: {
                    params: Joi.object({
                        id: Joi.string().uuid().required(), // class_id
                    }),
                },
            },
            handler: async (req, h) => {
                const classId = req.params.id;

                try {
                    const { data, error } = await db.rpc('get_class_grades_grouped', {
                        class_input: classId,
                    });

                    if (error) {
                        //console.error('❌ Failed to fetch grouped class grades:', error);
                        return Boom.internal('Gagal mengambil data nilai kelas');
                    }

                    // Normalisasi dan beri status kelulusan
                    const enrichedData = (data || []).map((student) => {
                        const courses = Array.isArray(student.courses) ? student.courses : [];

                        const enrichedCourses = courses.map((course) => {
                            const score = course.score_final_exam;

                            let status = 'belum ikut ujian';
                            if (typeof score === 'number') {
                                status = score >= 60 ? 'lulus' : 'tidak lulus';
                            }

                            return {
                                ...course,
                                status_kelulusan: status,
                            };
                        });

                        return {
                            ...student,
                            courses: enrichedCourses,
                        };
                    });

                    return h.response(enrichedData);
                } catch (err) {
                    //console.error('🔥 Unexpected error:', err);
                    return Boom.internal('Terjadi kesalahan saat mengambil data nilai');
                }
            },
        });
    },
};
