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
                            class_id,
                            created_at,
                            updated_at,
                            classes (
                              name,
                              teacher_id (
                                full_name
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
                        class_id: data.class_id,
                        kelas: data.classes?.name ?? null,
                        teacher: data.classes?.teacher_id?.full_name ?? null,
                        created_at: formatDate(data.created_at),
                        updated_at: formatDate(data.updated_at),
                    };
                }
            },

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

                            // jika tidak pakai class_code maka wajib isi manual , jika pakai class_code maka otomatis isi
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
                    try {
                        const userId = req.auth.credentials.id;
                        const { nim, full_name, jurusan, class_code, program_studi, perguruan_tinggi } = req.payload;

                        let finalProgramStudi = program_studi;
                        let finalPerguruanTinggi = perguruan_tinggi;
                        let classId = null;

                        if (class_code) {
                            const { data: kelas, error: classErr } = await db
                                .from('classes')
                                .select('id, program_studi, perguruan_tinggi')
                                .eq('class_code', class_code)
                                .maybeSingle();

                            if (classErr) throw Boom.badImplementation(classErr.message);
                            if (!kelas) throw Boom.badRequest('Kode kelas tidak valid');

                            classId = kelas.id;
                            finalProgramStudi = kelas.program_studi;
                            finalPerguruanTinggi = kelas.perguruan_tinggi;
                        }

                        if (!class_code && (!finalProgramStudi || !finalPerguruanTinggi)) {
                            throw Boom.badRequest('Program studi dan perguruan tinggi wajib diisi jika tidak join kelas');
                        }

                        const { data: existing } = await db
                            .from('student_profiles')
                            .select('id')
                            .eq('user_id', userId)
                            .maybeSingle();

                        if (existing) throw Boom.conflict('Profil sudah ada');

                        const { error: insertErr } = await db.from('student_profiles').insert({
                            user_id: userId,
                            nim,
                            full_name,
                            jurusan,
                            program_studi: finalProgramStudi,
                            perguruan_tinggi: finalPerguruanTinggi,
                            class_id: classId,
                        });

                        if (insertErr) {
                            if (insertErr.code === '23505' && insertErr.message.includes('student_profiles_nim_key')) {
                                throw Boom.conflict('NIM sudah digunakan');
                            }
                            throw Boom.badImplementation(insertErr.message);
                        }

                        if (insertErr) throw Boom.badImplementation(insertErr.message);

                        return h.response({ message: 'Profil berhasil dibuat' }).code(201);
                    } catch (err) {
                        // console.error('POST /student/profile error:', err);
                        if (Boom.isBoom(err)) return err;
                        return Boom.badImplementation('Terjadi kesalahan saat membuat profil');
                    }
                }
            },

            // === PUT /student/profile ===
            {
                method: 'PUT',
                path: '/student/profile',
                options: {
                    tags: ['api', 'Student'],
                    pre: [verifyToken, requireRole('student')],
                    validate: {
                        payload: Joi.object({
                            nim: Joi.string().optional(), // 🚀 FIX: nim juga harusnya bisa diupdate
                            full_name: Joi.string().optional(),
                            jurusan: Joi.string().optional(),
                            class_code: Joi.string().optional().allow('', null),
                            program_studi: Joi.string().valid(...ENUM_PROGRAM_STUDI).optional().allow(null),
                            perguruan_tinggi: Joi.string().valid(...ENUM_PERGURUAN_TINGGI).optional().allow(null),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { class_code, program_studi, perguruan_tinggi, ...updateData } = req.payload;

                    const { data: currentProfile, error: fetchError } = await db
                        .from('student_profiles')
                        .select('class_id')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (fetchError || !currentProfile) {
                        return Boom.notFound('Profil tidak ditemukan');
                    }

                    if (class_code) {
                        const { data: kelas, error: classErr } = await db
                            .from('classes')
                            .select('id, program_studi, perguruan_tinggi')
                            .eq('class_code', class_code)
                            .maybeSingle();

                        if (classErr || !kelas) {
                            return Boom.badRequest('Kode kelas tidak valid');
                        }

                        updateData.class_id = kelas.id;
                        updateData.program_studi = kelas.program_studi;
                        updateData.perguruan_tinggi = kelas.perguruan_tinggi;
                    } else {
                        // 🚀 FIX: Logika yang menyebabkan error dihapus.
                        // Jika mahasiswa TIDAK di dalam kelas, izinkan pembaruan prodi & PT.
                        // Jika SUDAH di dalam kelas, field prodi & PT dari payload akan diabaikan secara otomatis
                        // karena tidak dimasukkan ke dalam `updateData`.
                        if (!currentProfile.class_id) {
                            if (program_studi) updateData.program_studi = program_studi;
                            if (perguruan_tinggi) updateData.perguruan_tinggi = perguruan_tinggi;
                        }
                    }

                    updateData.updated_at = new Date().toISOString();

                    const { error } = await db
                        .from('student_profiles')
                        .update(updateData)
                        .eq('user_id', userId);

                    if (error) {
                        // Menangani kemungkinan duplikasi NIM
                        if (error.code === '23505' && error.message.includes('student_profiles_nim_key')) {
                            return Boom.conflict('NIM sudah digunakan oleh mahasiswa lain');
                        }
                        throw error;
                    }
                    return { message: 'Profil berhasil diperbarui' };
                },
            },

            // === PUT /student/profile/join-class
            {
                method: 'PUT',
                path: '/student/profile/join-class',
                options: {
                    tags: ['api', 'Student'],
                    pre: [verifyToken, requireRole('student')],
                    validate: {
                        payload: Joi.object({
                            class_code: Joi.string().required().description('Kode kelas untuk bergabung'),
                        }),
                    },
                    description: 'Bergabung ke kelas dengan kode kelas',
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { class_code } = req.payload;

                    try {
                        // Check if student already has a class
                        const { data: studentProfile, error: fetchError } = await db
                            .from('student_profiles')
                            .select('class_id')
                            .eq('user_id', userId)
                            .maybeSingle();

                        if (fetchError || !studentProfile) {
                            return Boom.notFound('Profil mahasiswa tidak ditemukan');
                        }

                        if (studentProfile.class_id) {
                            return Boom.badRequest('Anda sudah tergabung dalam kelas. Silakan keluar dari kelas terlebih dahulu');
                        }

                        // Find class by code
                        const { data: kelas, error: classErr } = await db
                            .from('classes')
                            .select('id, name, program_studi, perguruan_tinggi')
                            .eq('class_code', class_code)
                            .maybeSingle();

                        if (classErr || !kelas) {
                            return Boom.badRequest('Kode kelas tidak valid');
                        }

                        // Update student profile with class info
                        const { error: updateError } = await db
                            .from('student_profiles')
                            .update({
                                class_id: kelas.id,
                                program_studi: kelas.program_studi,
                                perguruan_tinggi: kelas.perguruan_tinggi,
                                updated_at: new Date().toISOString()
                            })
                            .eq('user_id', userId);

                        if (updateError) throw updateError;

                        return {
                            message: 'Berhasil bergabung ke kelas',
                            class_name: kelas.name,
                            program_studi: kelas.program_studi,
                            perguruan_tinggi: kelas.perguruan_tinggi
                        };

                    } catch (error) {
                        // console.error('Error joining class:', error);
                        return Boom.badImplementation('Gagal bergabung ke kelas');
                    }
                },
            },

            // === PUT /student/profile/leave-class
            {
                method: 'PUT',
                path: '/student/profile/leave-class',
                options: {
                    tags: ['api', 'Student'],
                    pre: [verifyToken, requireRole('student')],
                    validate: {
                        payload: Joi.object({
                            class_name: Joi.string().required().description('Nama kelas untuk konfirmasi'),
                        }),
                    },
                    description: 'Keluar dari kelas dengan konfirmasi nama kelas',
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { class_name } = req.payload;

                    try {
                        // Get current student profile with class info
                        const { data: studentProfile, error: fetchError } = await db
                            .from('student_profiles')
                            .select(`
                                class_id,
                                classes (
                                    name
                                )
                            `)
                            .eq('user_id', userId)
                            .maybeSingle();

                        if (fetchError) throw fetchError;

                        if (!studentProfile || !studentProfile.class_id) {
                            return Boom.badRequest('Anda tidak terdaftar dalam kelas manapun');
                        }

                        // Verify class name matches
                        if (studentProfile.classes?.name !== class_name) {
                            return Boom.badRequest('Nama kelas tidak sesuai. Silakan ketik ulang nama kelas dengan benar');
                        }

                        // Remove from class but keep program_studi and perguruan_tinggi
                        const { error: updateError } = await db
                            .from('student_profiles')
                            .update({
                                class_id: null,
                                updated_at: new Date().toISOString()
                                // Note: We keep program_studi and perguruan_tinggi unchanged
                            })
                            .eq('user_id', userId);

                        if (updateError) throw updateError;

                        return {
                            message: 'Berhasil keluar dari kelas',
                            class_name: studentProfile.classes.name
                        };

                    } catch (error) {
                        // console.error('Error leaving class:', error);
                        return Boom.badImplementation('Gagal keluar dari kelas');
                    }
                },
            },
        ]);
    },
};