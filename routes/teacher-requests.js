const Joi = require('joi');
const supabase = require('../db');
const { sendTeacherRequestStatusEmail } = require('../utils/email');

module.exports = {
    name: 'teacher-requests',
    register: async (server) => {
        server.route([
            // 🔽 POST: Buat pengajuan
            {
                method: 'POST',
                path: '/teacher-requests',
                options: {
                    tags: ['api'],
                    description: 'Request menjadi teacher (dengan NIDN, NIP, institusi, opsional credential file)',
                    validate: {
                        payload: Joi.object({
                            nidn: Joi.string().pattern(/^\d{10,18}$/).required(),
                            nip: Joi.string().pattern(/^\d{10,18}$/).allow(null, ''),
                            institution: Joi.string().max(100).allow(null, ''),
                            credential_file: Joi.string().uri().allow(null, ''),
                        }),
                    },
                },
                handler: async (request, h) => {
                    const user_id = request.auth.credentials.id;
                    const { nidn, nip, institution, credential_file } = request.payload;

                    // Cek apakah sudah ada pengajuan pending
                    const { data: existing, error: checkErr } = await supabase
                        .from('teacher_requests')
                        .select('id')
                        .eq('user_id', user_id)
                        .eq('status', 'pending')
                        .maybeSingle();

                    if (checkErr) {
                        console.error(checkErr);
                        return h.response({ error: 'Gagal memeriksa status pengajuan.' }).code(500);
                    }

                    if (existing) {
                        return h
                            .response({ message: 'Pengajuan sebelumnya masih dalam proses.' })
                            .code(400);
                    }

                    const { error: insertErr } = await supabase.from('teacher_requests').insert({
                        user_id,
                        nidn,
                        nip: nip || null,
                        institution: institution || null,
                        credential_file: credential_file || null,
                        status: 'pending',
                    });

                    if (insertErr) {
                        console.error(insertErr);
                        return h.response({ error: 'Gagal menyimpan pengajuan.' }).code(500);
                    }

                    return h.response({ message: 'Pengajuan berhasil dikirim.' }).code(201);
                },
            },

            // 🔽 GET: Daftar pengajuan (admin only)
            {
                method: 'GET',
                path: '/teacher-requests',
                options: {
                    tags: ['api'],
                    description: 'List semua pengajuan dosen (admin only)',
                },
                handler: async (request, h) => {
                    const { role } = request.auth.credentials;

                    if (role !== 'admin') {
                        return h.response({ error: 'Akses ditolak.' }).code(403);
                    }

                    const { data, error } = await supabase
                        .from('teacher_requests')
                        .select('id, user_id, nidn, nip, institution, credential_file, status, created_at')
                        .order('created_at', { ascending: false });

                    if (error) {
                        console.error(error);
                        return h.response({ error: 'Gagal mengambil data.' }).code(500);
                    }

                    return h.response(data);
                },
            },

            // 🔽 PATCH: Ubah status pengajuan
            {
                method: 'PATCH',
                path: '/teacher-requests/{id}/status',
                options: {
                    tags: ['api'],
                    description: 'Update status pengajuan (admin only)',
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                        }),
                        payload: Joi.object({
                            status: Joi.string().valid('approved', 'rejected').required(),
                        }),
                    },
                },
                handler: async (request, h) => {
                    const { role, id: reviewerId } = request.auth.credentials;
                    const { id } = request.params;
                    const { status } = request.payload;

                    if (role !== 'admin') {
                        return h.response({ error: 'Akses ditolak.' }).code(403);
                    }

                    // Ambil user_id & email pengaju
                    const { data: reqData, error: getErr } = await supabase
                        .from('teacher_requests')
                        .select('user_id, users.email')
                        .eq('id', id)
                        .limit(1)
                        .single()
                        .maybeSingle()
                        .select('user_id, users ( email )');

                    if (getErr || !reqData) {
                        console.error(getErr);
                        return h.response({ error: 'Data pengajuan tidak ditemukan.' }).code(404);
                    }

                    const { user_id, users } = reqData;

                    // Update status
                    const { error: updateErr } = await supabase
                        .from('teacher_requests')
                        .update({
                            status,
                            reviewed_by: reviewerId,
                            reviewed_at: new Date(),
                            updated_at: new Date(),
                        })
                        .eq('id', id);

                    if (updateErr) {
                        console.error(updateErr);
                        return h.response({ error: 'Gagal mengupdate status.' }).code(500);
                    }

                    // Kirim email notifikasi
                    if (users?.email) {
                        await sendTeacherRequestStatusEmail(users.email, status);
                    }

                    return h.response({ message: `Status berhasil diubah menjadi ${status}` });
                },
            },
        ]);
    },
};
