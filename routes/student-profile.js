const Joi = require('joi');
const db = require('../db');
const Boom = require('@hapi/boom');
const { verifyToken, requireRole } = require('../utils/middleware');
const { formatDate } = require('../utils/format-date');

const ENUM_PROGRAM_STUDI = [
    'Teknik Informatika',
    'Teknik Listrik',
    'Teknik Elektronika',
    'Teknik Mesin',
    'Administrasi Bisnis',
    'Akuntansi',
];

const ENUM_PERGURUAN_TINGGI = [
    'Politeknik Negeri Semarang',
    'Universitas Diponegoro',
    'Universitas Semarang',
    'Universitas Dian Nuswantoro',
    'Universitas Muhammadiyah Semarang',
];

module.exports = {
    name: 'student-profile-routes',
    register: async function (server) {
        server.route([
            // === GET /student/profile
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
                        .select(`
        nim,
        full_name,
        jurusan,
        program_studi,
        perguruan_tinggi,
        created_at,
        updated_at,
        classes (
          name
          )
        )
      `)
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error) throw error;
                    if (!data) return h.response({ message: 'Profile not found' }).code(404);

                    return {
                        nim: data.nim,
                        full_name: data.full_name,
                        jurusan: data.jurusan,
                        program_studi: data.program_studi,
                        perguruan_tinggi: data.perguruan_tinggi,
                        kelas : data.classes?.name ?? null,
                        created_at: formatDate(data.created_at),
                        updated_at: formatDate(data.updated_at),
                    };
                }
            }
            ,

            // === POST /student/profile
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
                            jurusan: Joi.string().required(),
                            class_code: Joi.string().optional().allow('', null),

                            // jika tidak pakai class_code
                            program_studi: Joi.string()
                                .valid(...ENUM_PROGRAM_STUDI)
                                .optional()
                                .allow(null),
                            perguruan_tinggi: Joi.string()
                                .valid(...ENUM_PERGURUAN_TINGGI)
                                .optional()
                                .allow(null),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { nim, full_name, jurusan, class_code, program_studi, perguruan_tinggi } = req.payload;

                    let finalProgramStudi = program_studi;
                    let finalPerguruanTinggi = perguruan_tinggi;
                    let classId = null;

                    // Jika class_code disediakan, cari kelas
                    if (class_code) {
                        const { data: kelas, error: classErr } = await db
                            .from('classes')
                            .select('id, program_studi, perguruan_tinggi')
                            .eq('class_code', class_code)
                            .maybeSingle();

                        if (classErr || !kelas) {
                            return Boom.badRequest('Kode kelas tidak valid');
                        }

                        classId = kelas.id;
                        finalProgramStudi = kelas.program_studi;
                        finalPerguruanTinggi = kelas.perguruan_tinggi;
                    }

                    // Validasi jika mandiri tapi tidak isi enum
                    if (!class_code && (!finalProgramStudi || !finalPerguruanTinggi)) {
                        return Boom.badRequest('Program studi dan perguruan tinggi wajib diisi jika tidak join kelas');
                    }

                    // Cek apakah profil sudah ada
                    const { data: existing } = await db
                        .from('student_profiles')
                        .select('id')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (existing) {
                        return Boom.conflict('Profil sudah ada');
                    }

                    const { error: insertErr } = await db.from('student_profiles').insert({
                        user_id: userId,
                        nim,
                        full_name,
                        jurusan,
                        program_studi: finalProgramStudi,
                        perguruan_tinggi: finalPerguruanTinggi,
                        class_id: classId,
                    });

                    if (insertErr) throw insertErr;
                    return h.response({ message: 'Profil berhasil dibuat' }).code(201);
                },
            },

            // === PUT /student/profile
            {
                method: 'PUT',
                path: '/student/profile',
                options: {
                    tags: ['api', 'Student'],
                    pre: [verifyToken, requireRole('student')],
                    validate: {
                        payload: Joi.object({
                            full_name: Joi.string().optional(),
                            jurusan: Joi.string().optional(),
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
                    return { message: 'Profil berhasil diperbarui' };
                },
            },
        ]);
    },
};
