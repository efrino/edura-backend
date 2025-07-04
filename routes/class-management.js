const Joi = require('joi');
const db = require('../db');
const Boom = require('@hapi/boom');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'class-management',
    version: '1.0.0',
    register: async function (server) {
        server.route([
            // === POST /teacher/class ===
            {
                method: 'POST',
                path: '/teacher/class',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Buat kelas baru berdasarkan profil teacher',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        payload: Joi.object({
                            name: Joi.string().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const teacherId = req.auth.credentials.id;
                    const { name } = req.payload;

                    // Ambil data profil teacher
                    const { data: profile, error: profileError } = await db
                        .from('teacher_profiles')
                        .select('program_studi, perguruan_tinggi')
                        .eq('user_id', teacherId)
                        .maybeSingle();

                    if (profileError || !profile) {
                        return Boom.badRequest('Profil teacher tidak ditemukan atau belum lengkap');
                    }

                    const { program_studi, perguruan_tinggi } = profile;

                    const { error } = await db.from('classes').insert({
                        name,
                        teacher_id: teacherId,
                        program_studi,
                        perguruan_tinggi,
                    });

                    if (error) {
                        console.error(error);
                        return Boom.internal('Gagal membuat kelas');
                    }

                    return h.response({
                        message: 'Kelas berhasil dibuat',
                    }).code(201);
                },
            },

            // 🔍 GET /teacher/classes
            {
                method: 'GET',
                path: '/teacher/classes',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Ambil semua kelas milik teacher',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const teacherId = req.auth.credentials.id;
                    const { data, error } = await db
                        .from('classes')
                        .select('*')
                        .eq('teacher_id', teacherId);

                    if (error) {
                        console.error(error);
                        return Boom.internal('Gagal mengambil data kelas');
                    }

                    return data;
                },
            },

            // 🔍 GET /teacher/class/{id}/students
            {
                method: 'GET',
                path: '/teacher/class/{id}/students',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Ambil semua siswa yang tergabung dalam kelas',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const classId = req.params.id;
                    const { data, error } = await db
                        .from('student_profiles')
                        .select('id, full_name, nim, program_studi, jurusan, perguruan_tinggi')
                        .eq('class_id', classId);

                    if (error) return Boom.internal('Gagal mengambil anggota kelas');
                    return data;
                },
            },

            // ❌ DELETE /teacher/class/{id}/students/{student_id}
            {
                method: 'DELETE',
                path: '/teacher/class/{id}/students/{student_id}',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Keluarkan siswa dari kelas',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const { student_id } = req.params;
                    const { error } = await db
                        .from('student_profiles')
                        .update({ class_id: null })
                        .eq('id', student_id);

                    if (error) return Boom.internal('Gagal menghapus siswa dari kelas');
                    return { message: 'Siswa berhasil dikeluarkan dari kelas' };
                },
            },

            // ✏️ PUT /teacher/class/{id}
            {
                method: 'PUT',
                path: '/teacher/class/{id}',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Edit nama kelas',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        payload: Joi.object({
                            name: Joi.string().optional(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { id } = req.params;
                    const { error } = await db.from('classes').update(req.payload).eq('id', id);
                    if (error) return Boom.internal('Gagal mengupdate kelas');
                    return { message: 'Kelas berhasil diperbarui' };
                },
            },

            // ❌ DELETE /teacher/class/{id}
            {
                method: 'DELETE',
                path: '/teacher/class/{id}',
                options: {
                    tags: ['api', 'Teacher'],
                    description: 'Hapus kelas',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const { id } = req.params;
                    const { error } = await db.from('classes').delete().eq('id', id);
                    if (error) return Boom.internal('Gagal menghapus kelas');
                    return { message: 'Kelas berhasil dihapus' };
                },
            },
        ]);
    },
};
