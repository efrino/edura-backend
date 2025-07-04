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
            path: '/teacher/class/{id}/grades',
            options: {
                tags: ['api', 'Teacher'],
                description: 'Ambil semua siswa dalam satu kelas (tanpa nilai)',
                pre: [verifyToken, requireRole('teacher')],
                validate: {
                    params: Joi.object({
                        id: Joi.string().uuid().required(), // class_id
                    }),
                },
            },
            handler: async (req, h) => {
                const classId = req.params.id;

                const { data, error } = await db
                    .from('student_profiles')
                    .select('id, full_name, nim, program_studi, jurusan, perguruan_tinggi')
                    .eq('class_id', classId);

                if (error) {
                    console.error(error);
                    return Boom.internal('Gagal mengambil data siswa');
                }

                return data;
            },
        });
    },
};
