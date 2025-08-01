const Joi = require('joi');
const Boom = require('@hapi/boom');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');
const { formatDate } = require('../utils/format-date');

// Use the same enum values as student routes for consistency
const ENUM_PROGRAM_STUDI = [
    'Teknik Informatika',
    'Teknik Listrik',
    'Teknik Elektronika',
    'Teknik Mesin',
    'Administrasi Bisnis',
    'Akuntansi',
    'Arsitektur',
    'Periklanan',
    'Manajemen',
    'Teknik Industri',
    'Pendidikan Biologi',
    'Pendidikan Matematika',
    'Kehutanan',
    'Farmasi',
    'Demografi',
    'Geografi',
    'Keperawatan',
    'Gizi'
];

const ENUM_PERGURUAN_TINGGI = [
    'Politeknik Negeri Semarang',
    'Politeknik Negeri Batam',
    'Politeknik Negeri Madiun',
    'Politeknik Negeri Pontianak',
    'Politeknik Negeri Ketapang',
    'Politeknik Negeri Sambas',
    'Universitas Diponegoro',
    'Universitas Negeri Semarang',
    'Universitas Dian Nuswantoro',
    'Politeknik Media Kreatif',
    'Universitas Muhammadiyah Semarang',
    'Universitas PGRI Semarang',
    'Universitas Islam Negeri Semarang',
    'Universitas Sultan Ageng Tirtayasa',
    'Universitas Gadjah Mada',
    'Universitas Negeri Sebelas Maret',
    'Universitas Negeri Yogyakarta',
    'Bina Sarana Informatika'
];

module.exports = {
    name: 'teacher-profile-routes',
    register: async function (server) {
        server.route([
            // === GET /teacher/profile ===
            {
                method: 'GET',
                path: '/teacher/profile',
                options: {
                    tags: ['api', 'Teacher'],
                    pre: [verifyToken, requireRole('teacher')],
                    description: 'Ambil profil teacher berdasarkan user login',
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;

                    const { data, error } = await db
                        .from('teacher_profiles')
                        .select(`
                            nidn,
                            full_name,
                            fakultas,
                            program_studi,
                            perguruan_tinggi,
                            created_at,
                            updated_at
                        `)
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error) throw error;
                    if (!data) return Boom.notFound('Profil teacher belum dibuat');

                    return {
                        nidn: data.nidn,
                        full_name: data.full_name,
                        fakultas: data.fakultas,
                        program_studi: data.program_studi,
                        perguruan_tinggi: data.perguruan_tinggi,
                        created_at: formatDate(data.created_at),
                        updated_at: formatDate(data.updated_at),
                    };
                },
            },

            // === POST /teacher/profile ===
            {
                method: 'POST',
                path: '/teacher/profile',
                options: {
                    tags: ['api', 'Teacher'],
                    pre: [verifyToken, requireRole('teacher')],
                    description: 'Buat profil teacher baru',
                    validate: {
                        payload: Joi.object({
                            nidn: Joi.string().required(),
                            full_name: Joi.string().required(),
                            fakultas: Joi.string().required(),
                            program_studi: Joi.string().valid(...ENUM_PROGRAM_STUDI).required(),
                            perguruan_tinggi: Joi.string().valid(...ENUM_PERGURUAN_TINGGI).required(),
                        }),
                    },
                },
                handler: async (request, h) => {
                    const user_id = request.auth.credentials.id;
                    const { nidn, full_name, fakultas, program_studi, perguruan_tinggi } = request.payload;

                    const { data: existing, error: checkError } = await db
                        .from('teacher_profiles')
                        .select('id')
                        .eq('user_id', user_id)
                        .maybeSingle();

                    if (checkError) {
                        // console.error(checkError);
                        return Boom.badImplementation('Gagal mengecek profil');
                    }

                    if (existing) {
                        return Boom.conflict('Profil teacher sudah ada');
                    }

                    const insertData = {
                        user_id,
                        nidn,
                        full_name,
                        fakultas,
                        program_studi,
                        perguruan_tinggi,
                    };

                    const { error } = await db.from('teacher_profiles').insert(insertData);

                    if (error) {
                        // console.error(error);
                        return Boom.badImplementation('Gagal menyimpan profil');
                    }

                    return h.response({ message: 'Profil teacher berhasil disimpan' }).code(201);
                },
            },

            // === PUT /teacher/profile ===
            {
                method: 'PUT',
                path: '/teacher/profile',
                options: {
                    tags: ['api', 'Teacher'],
                    pre: [verifyToken, requireRole('teacher')],
                    description: 'Update profil teacher',
                    validate: {
                        payload: Joi.object({
                            nidn: Joi.string().optional(),
                            full_name: Joi.string().optional(),
                            fakultas: Joi.string().optional(),
                            program_studi: Joi.string().valid(...ENUM_PROGRAM_STUDI).optional(),
                            perguruan_tinggi: Joi.string().valid(...ENUM_PERGURUAN_TINGGI).optional(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const payload = req.payload;

                    const { error } = await db
                        .from('teacher_profiles')
                        .update({ ...payload, updated_at: new Date().toISOString() })
                        .eq('user_id', userId);

                    if (error) {
                        // console.error(error);
                        return Boom.badImplementation('Gagal mengupdate profil');
                    }

                    return { message: 'Profil teacher berhasil diperbarui' };
                },
            },
        ]);
    },
};