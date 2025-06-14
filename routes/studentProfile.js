const Joi = require('joi');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'student-profile-routes',
    register: async function (server) {
        server.route([
            // 🔍 GET /student/profile
            {
                method: 'GET',
                path: '/student/profile',
                options: {
                    tags: ['api', 'Student'],
                    pre: [verifyToken, requireRole('student')],
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { data, error } = await db
                        .from('student_profiles')
                        .select('*')
                        .eq('user_id', userId)
                        .maybeSingle();
                    if (error) throw error;
                    if (!data) return h.response({ message: 'Profile not found' }).code(404);
                    return data;
                },
            },

            // 📝 POST /student/profile (isi pertama kali)
            {
                method: 'POST',
                path: '/student/profile',
                options: {
                    tags: ['api', 'Student'],
                    pre: [verifyToken, requireRole('student')],
                    validate: {
                        payload: Joi.object({
                            nim: Joi.string().required(),
                            full_name: Joi.string().required(),
                            kelas: Joi.string().required(),
                            jurusan: Joi.string().required(),
                            program_studi: Joi.string()
                                .valid(
                                    'Teknik Informatika',
                                    'Teknik Listrik',
                                    'Teknik Elektronika',
                                    'Teknik Mesin',
                                    'Administrasi Bisnis',
                                    'Akuntansi'
                                )
                                .required(),
                            perguruan_tinggi: Joi.string().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { nim, full_name, kelas, jurusan, program_studi, perguruan_tinggi } = req.payload;

                    const existing = await db
                        .from('student_profiles')
                        .select('id')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (existing.data) {
                        return h.response({ error: 'Profile already exists' }).code(400);
                    }

                    const { error } = await db.from('student_profiles').insert({
                        user_id: userId,
                        nim,
                        full_name,
                        kelas,
                        jurusan,
                        program_studi,
                        perguruan_tinggi,
                    });

                    if (error) throw error;
                    return h.response({ message: 'Profile created successfully' }).code(201);
                },
            },

            // ✏️ PUT /student/profile (update profile)
            {
                method: 'PUT',
                path: '/student/profile',
                options: {
                    tags: ['api', 'Student'],
                    pre: [verifyToken, requireRole('student')],
                    validate: {
                        payload: Joi.object({
                            full_name: Joi.string().optional(),
                            kelas: Joi.string().optional(),
                            jurusan: Joi.string().optional(),
                            program_studi: Joi.string()
                                .valid(
                                    'Teknik Informatika',
                                    'Teknik Listrik',
                                    'Teknik Elektronika',
                                    'Teknik Mesin',
                                    'Administrasi Bisnis',
                                    'Akuntansi'
                                )
                                .optional(),
                            perguruan_tinggi: Joi.string().optional(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;

                    const { error } = await db
                        .from('student_profiles')
                        .update(req.payload)
                        .eq('user_id', userId);
                    if (error) throw error;

                    return { message: 'Profile updated successfully' };
                },
            },
        ]);
    },
};
