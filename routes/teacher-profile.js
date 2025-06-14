const Joi = require('joi');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'teacher-profile-routes',
    register: async function (server) {
        server.route([
            // 🔍 GET /teacher/profile
            {
                method: 'GET',
                path: '/teacher/profile',
                options: {
                    tags: ['api', 'Teacher'],
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { data, error } = await db
                        .from('teacher_profiles')
                        .select('*')
                        .eq('user_id', userId)
                        .maybeSingle();
                    if (error) throw error;
                    if (!data) return h.response({ message: 'Profile not found' }).code(404);
                    return data;
                },
            },

            // 📝 POST /teacher/profile
            {
                method: 'POST',
                path: '/teacher/profile',
                options: {
                    tags: ['api', 'Teacher'],
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        payload: Joi.object({
                            nidn: Joi.string().required(),
                            full_name: Joi.string().required(),
                            fakultas: Joi.string().required(),
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
                    const { nidn, full_name, fakultas, program_studi, perguruan_tinggi } = req.payload;

                    const existing = await db
                        .from('teacher_profiles')
                        .select('id')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (existing.data) {
                        return h.response({ error: 'Profile already exists' }).code(400);
                    }

                    const { error } = await db.from('teacher_profiles').insert({
                        user_id: userId,
                        nidn,
                        full_name,
                        fakultas,
                        program_studi,
                        perguruan_tinggi,
                    });

                    if (error) throw error;
                    return h.response({ message: 'Profile created successfully' }).code(201);
                },
            },

            // ✏️ PUT /teacher/profile
            {
                method: 'PUT',
                path: '/teacher/profile',
                options: {
                    tags: ['api', 'Teacher'],
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        payload: Joi.object({
                            full_name: Joi.string().optional(),
                            fakultas: Joi.string().optional(),
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
                        .from('teacher_profiles')
                        .update(req.payload)
                        .eq('user_id', userId);

                    if (error) throw error;

                    return { message: 'Profile updated successfully' };
                },
            },
        ]);
    },
};
