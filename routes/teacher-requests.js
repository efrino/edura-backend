const Joi = require('joi');
const supabase = require('../db');
const { sendTeacherRequestStatusEmail } = require('../utils/email');

module.exports = {
    name: 'teacher-requests',
    register: async (server) => {
        server.route([
            // 🔽 POST: Buat pengajuan (PUBLIC - tidak perlu login)
            {
                method: 'POST',
                path: '/teacher-requests',
                options: {
                    tags: ['api'],
                    description: 'Request menjadi teacher (dengan NIDN, NIP, institusi, opsional credential file)',
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                            full_name: Joi.string().min(2).max(100).required(),
                            nidn: Joi.string().pattern(/^\d{10,18}$/).required(),
                            // ⚠️ PERBAIKAN: Ubah validasi NIP - bisa string kosong atau null
                            nip: Joi.string().pattern(/^\d{10,18}$/).allow('', null).optional(),
                            // ⚠️ PERBAIKAN: Ubah validasi institution - bisa string kosong atau null  
                            institution: Joi.string().max(100).allow('', null).optional(),
                            // ⚠️ PERBAIKAN: Ubah validasi credential_file - bisa string kosong atau null
                            credential_file: Joi.string().uri().allow('', null).optional(),
                        }),
                    },
                    // ⚠️ TAMBAHAN: Log untuk debugging
                    pre: [
                        {
                            method: async (request, h) => {
                                console.log('📝 Received payload:', JSON.stringify(request.payload, null, 2));
                                return h.continue;
                            }
                        }
                    ]
                },
                handler: async (request, h) => {
                    const { email, full_name, nidn, nip, institution, credential_file } = request.payload;

                    console.log('🔍 Processing teacher request for:', email);

                    try {
                        // 🆕 TAMBAHAN: Cek apakah NIDN sudah ada dengan status pending
                        const { data: existingNIDN, error: nidnCheckErr } = await supabase
                            .from('teacher_requests')
                            .select('id, status, user_id')
                            .eq('nidn', nidn.trim())
                            .eq('status', 'pending')
                            .maybeSingle();

                        if (nidnCheckErr) {
                            console.error('Error checking NIDN:', nidnCheckErr);
                            return h.response({ error: 'Gagal memeriksa data NIDN.' }).code(500);
                        }

                        if (existingNIDN) {
                            console.log('❌ NIDN already has pending request');
                            return h
                                .response({
                                    error: 'NIDN sudah terdaftar dalam pengajuan yang sedang diproses.',
                                    field: 'nidn',
                                    details: 'NIDN ini sudah memiliki pengajuan dengan status pending. Silakan tunggu hingga pengajuan tersebut selesai diproses atau hubungi admin jika terjadi kesalahan.'
                                })
                                .code(400);
                        }

                        // Cek apakah email sudah terdaftar
                        const { data: existingUser, error: userCheckErr } = await supabase
                            .from('users')
                            .select('id')
                            .eq('email', email.toLowerCase().trim())
                            .maybeSingle();

                        if (userCheckErr) {
                            console.error('Error checking user:', userCheckErr);
                            return h.response({ error: 'Gagal memeriksa data pengguna.' }).code(500);
                        }

                        let user_id = null;

                        if (existingUser) {
                            // User sudah ada, gunakan ID yang ada
                            user_id = existingUser.id;
                            console.log('✅ User exists with ID:', user_id);

                            // Cek apakah sudah ada pengajuan pending dari user ini
                            const { data: existingRequest, error: checkErr } = await supabase
                                .from('teacher_requests')
                                .select('id, status')
                                .eq('user_id', user_id)
                                .eq('status', 'pending')
                                .maybeSingle();

                            if (checkErr) {
                                console.error('Error checking existing request:', checkErr);
                                return h.response({ error: 'Gagal memeriksa status pengajuan.' }).code(500);
                            }

                            if (existingRequest) {
                                console.log('❌ User already has pending request');
                                return h
                                    .response({
                                        error: 'Anda sudah memiliki pengajuan yang masih dalam proses.',
                                        field: 'email',
                                        details: 'Email ini sudah memiliki pengajuan dengan status pending.',
                                        status: 'pending'
                                    })
                                    .code(400);
                            }
                        } else {
                            // User belum ada, buat user baru
                            console.log('👤 Creating new user...');
                            const { data: newUser, error: createUserErr } = await supabase
                                .from('users')
                                .insert({
                                    email: email.toLowerCase().trim(),
                                    full_name: full_name.trim(),
                                    role: 'student', // Default role
                                    is_verified: false, // Belum terverifikasi
                                    plan: 'free'
                                })
                                .select('id')
                                .single();

                            if (createUserErr) {
                                console.error('Error creating user:', createUserErr);
                                // Check if it's a duplicate email error
                                if (createUserErr.code === '23505') {
                                    return h.response({
                                        error: 'Email sudah terdaftar dalam sistem.',
                                        field: 'email',
                                        details: 'Email ini sudah digunakan oleh akun lain.'
                                    }).code(400);
                                }
                                return h.response({
                                    error: 'Gagal membuat akun pengguna.'
                                }).code(500);
                            }

                            user_id = newUser.id;
                            console.log('✅ New user created with ID:', user_id);
                        }

                        // Prepare data untuk insert
                        const insertData = {
                            user_id,
                            nidn: nidn.trim(),
                            // ⚠️ PERBAIKAN: Handle empty string dan null dengan benar
                            nip: (nip && nip.trim()) ? nip.trim() : null,
                            institution: (institution && institution.trim()) ? institution.trim() : null,
                            credential_file: (credential_file && credential_file.trim()) ? credential_file.trim() : null,
                            status: 'pending',
                        };

                        console.log('💾 Inserting teacher request:', insertData);

                        // Buat teacher request
                        const { error: insertErr } = await supabase
                            .from('teacher_requests')
                            .insert(insertData);

                        if (insertErr) {
                            console.error('Error inserting teacher request:', insertErr);

                            // Handle specific constraint violations
                            if (insertErr.code === '23P01' && insertErr.message.includes('unique_nidn_pending')) {
                                return h.response({
                                    error: 'NIDN sudah terdaftar dalam pengajuan yang sedang diproses.',
                                    field: 'nidn',
                                    details: 'NIDN ini sudah memiliki pengajuan dengan status pending. Silakan tunggu hingga pengajuan tersebut selesai diproses atau hubungi admin jika terjadi kesalahan.',
                                    statusCode: 409
                                }).code(409);
                            }

                            // Handle other unique constraint violations
                            if (insertErr.code === '23505') {
                                if (insertErr.message.includes('email')) {
                                    return h.response({
                                        error: 'Email sudah terdaftar dalam pengajuan lain.',
                                        field: 'email',
                                        details: 'Email ini sudah digunakan dalam pengajuan teacher request lainnya.',
                                        statusCode: 409
                                    }).code(409);
                                }
                            }

                            return h.response({
                                error: 'Gagal menyimpan pengajuan.',
                                statusCode: 500
                            }).code(500);
                        }

                        console.log('✅ Teacher request created successfully');

                        // Kirim email konfirmasi pengajuan
                        try {
                            const { sendTeacherRequestConfirmationEmail } = require('../utils/email');
                            await sendTeacherRequestConfirmationEmail(email, full_name);
                            console.log('✅ Confirmation email sent successfully');
                        } catch (emailErr) {
                            console.error('Error sending confirmation email:', emailErr);
                            // Tidak perlu gagalkan request hanya karena email gagal
                        }

                        return h.response({
                            message: 'Pengajuan berhasil dikirim. Tim kami akan meninjau dalam 1-3 hari kerja.',
                            data: {
                                email: email,
                                full_name: full_name,
                                status: 'pending'
                            }
                        }).code(201);

                    } catch (error) {
                        console.error('Unexpected error in teacher request:', error);
                        return h.response({ error: 'Terjadi kesalahan sistem.' }).code(500);
                    }
                },
            },

            // GET endpoints tetap sama...
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
                        .select(`
                            id, 
                            user_id, 
                            nidn, 
                            nip, 
                            institution, 
                            credential_file, 
                            status, 
                            created_at,
                            users!teacher_requests_user_id_fkey ( email, full_name )
                        `)
                        .order('created_at', { ascending: false });

                    if (error) {
                        console.error(error);
                        return h.response({ error: 'Gagal mengambil data.' }).code(500);
                    }

                    return h.response(data);
                },
            },

            {
                method: 'GET',
                path: '/teacher-requests/my-status',
                options: {
                    tags: ['api'],
                    description: 'Cek status pengajuan teacher request saya',
                },
                handler: async (request, h) => {
                    const user_id = request.auth.credentials.id;

                    const { data, error } = await supabase
                        .from('teacher_requests')
                        .select('id, status, created_at, reviewed_at')
                        .eq('user_id', user_id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (error) {
                        console.error(error);
                        return h.response({ error: 'Gagal mengambil status pengajuan.' }).code(500);
                    }

                    return h.response(data);
                },
            },

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

                    // Ambil data pengajuan beserta user info
                    const { data: reqData, error: getErr } = await supabase
                        .from('teacher_requests')
                        .select(`
                            user_id, 
                            status as current_status,
                            users!teacher_requests_user_id_fkey ( email, full_name )
                        `)
                        .eq('id', id)
                        .single();

                    if (getErr || !reqData) {
                        console.error('Error fetching request data:', getErr);
                        return h.response({ error: 'Data pengajuan tidak ditemukan.' }).code(404);
                    }

                    const { user_id, users, current_status } = reqData;

                    // Cek apakah status sudah diubah sebelumnya
                    if (current_status !== 'pending') {
                        return h.response({
                            error: `Pengajuan sudah diproses dengan status: ${current_status}`
                        }).code(400);
                    }

                    // Update status pengajuan
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
                        console.error('Error updating request status:', updateErr);
                        return h.response({ error: 'Gagal mengupdate status.' }).code(500);
                    }

                    // Jika approved, update role user menjadi teacher
                    if (status === 'approved') {
                        const { error: updateUserErr } = await supabase
                            .from('users')
                            .update({
                                role: 'teacher',
                                updated_at: new Date()
                            })
                            .eq('id', user_id);

                        if (updateUserErr) {
                            console.error('Error updating user role:', updateUserErr);
                            // Rollback status pengajuan jika gagal update role
                            await supabase
                                .from('teacher_requests')
                                .update({ status: 'pending' })
                                .eq('id', id);

                            return h.response({
                                error: 'Gagal mengupdate role pengguna.'
                            }).code(500);
                        }
                    }

                    // Kirim email notifikasi
                    if (users?.email) {
                        try {
                            await sendTeacherRequestStatusEmail(users.email, status, users.full_name);
                            console.log('✅ Status notification email sent successfully');
                        } catch (emailErr) {
                            console.error('Error sending status email:', emailErr);
                            // Email gagal tidak perlu menggagalkan proses
                        }
                    }

                    return h.response({
                        message: `Status berhasil diubah menjadi ${status}`,
                        data: {
                            id,
                            status,
                            user_email: users?.email,
                            reviewed_at: new Date()
                        }
                    });
                },
            },
        ]);
    },
};