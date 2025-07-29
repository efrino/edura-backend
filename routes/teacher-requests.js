const Joi = require('joi');
const supabase = require('../db');
const { getEnv } = require('../utils/env')
const crypto = require('crypto');
const { sendTeacherRequestStatusEmail, sendTeacherRequestConfirmationEmail } = require('../utils/email');

// Helper function to generate user-friendly status messages
function getStatusMessage(status, rejectReason = null) {
    switch (status) {
        case 'pending':
            return 'Pengajuan Anda sedang dalam proses review oleh tim kami. Estimasi 1-3 hari kerja.';
        case 'approved':
            return 'Selamat! Pengajuan Anda telah disetujui. Anda sekarang terdaftar sebagai guru.';
        case 'rejected':
            return rejectReason
                ? `Pengajuan Anda ditolak dengan alasan: ${rejectReason}`
                : 'Maaf, pengajuan Anda tidak dapat disetujui. Silakan hubungi admin untuk informasi lebih lanjut.';
        default:
            return 'Status tidak diketahui.';
    }
}

module.exports = {
    name: 'teacher-requests',
    register: async (server) => {
        server.route([
            // 🔽 POST: Buat pengajuan (PUBLIC - tidak perlu login)
            {
                method: 'POST',
                path: '/teacher-requests',
                options: {
                    auth: false,
                    tags: ['api'],
                    description: 'Request menjadi teacher (dengan NIDN, NIP, institusi, opsional credential file)',
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                            full_name: Joi.string().min(2).max(100).required(),
                            nidn: Joi.string().pattern(/^\d{10,18}$/).required(),
                            nip: Joi.string().pattern(/^\d{10,18}$/).allow('', null).optional(),
                            institution: Joi.string().max(100).allow('', null).optional(),
                            credential_file: Joi.string().uri().allow('', null).optional(),
                        }),
                    },
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
                        // Check if NIDN already exists with pending status
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

                        // Check if email is already registered
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
                            user_id = existingUser.id;
                            console.log('✅ User exists with ID:', user_id);

                            // Check if user already has pending request
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
                            // Create new user with unusable password
                            console.log('👤 Creating new user...');

                            // Generate password hash yang tidak bisa digunakan untuk login
                            // Prefix khusus yang tidak akan pernah match dengan bcrypt compare
                            const UNUSABLE_PASSWORD_PREFIX = '!TEACHER_REQUEST_PENDING!';
                            const unusablePasswordHash = UNUSABLE_PASSWORD_PREFIX + crypto.randomBytes(32).toString('hex');

                            const { data: newUser, error: createUserErr } = await supabase
                                .from('users')
                                .insert({
                                    email: email.toLowerCase().trim(),
                                    full_name: full_name.trim(),
                                    role: 'student', // Masih student sampai approved
                                    is_verified: false, // Belum verified
                                    plan: 'free',
                                    password_hash: unusablePasswordHash // Password yang tidak bisa digunakan
                                })
                                .select('id')
                                .single();

                            if (createUserErr) {
                                console.error('Error creating user:', createUserErr);
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


                        // Prepare data for insert
                        const insertData = {
                            user_id,
                            nidn: nidn.trim(),
                            nip: (nip && nip.trim()) ? nip.trim() : null,
                            institution: (institution && institution.trim()) ? institution.trim() : null,
                            credential_file: (credential_file && credential_file.trim()) ? credential_file.trim() : null,
                            status: 'pending',
                        };

                        console.log('💾 Inserting teacher request:', insertData);

                        // Create teacher request
                        const { error: insertErr } = await supabase
                            .from('teacher_requests')
                            .insert(insertData);

                        if (insertErr) {
                            console.error('Error inserting teacher request:', insertErr);

                            if (insertErr.code === '23P01' && insertErr.message.includes('unique_nidn_pending')) {
                                return h.response({
                                    error: 'NIDN sudah terdaftar dalam pengajuan yang sedang diproses.',
                                    field: 'nidn',
                                    details: 'NIDN ini sudah memiliki pengajuan dengan status pending.',
                                    statusCode: 409
                                }).code(409);
                            }

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

                        // Send confirmation email
                        try {
                            await sendTeacherRequestConfirmationEmail(email, full_name);
                            console.log('✅ Confirmation email sent successfully');
                        } catch (emailErr) {
                            console.error('Error sending confirmation email:', emailErr);
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

            // GET: List all teacher requests (admin only) - REQUIRES AUTH
            {
                method: 'GET',
                path: '/teacher-requests',
                options: {
                    // NO auth: false here - this needs authentication
                    tags: ['api'],
                    description: 'List semua pengajuan dosen (admin only)',
                },


                handler: async (request, h) => {
                    const { role, email } = request.auth.credentials;

                    console.log('🔍 User accessing teacher requests:', {
                        email,
                        role,
                        isAdmin: role === 'admin'
                    });

                    if (role !== 'admin') {
                        return h.response({ error: 'Akses ditolak.' }).code(403);
                    }
                    console.log('📋 Fetching teacher requests...');

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
            reject_reason,
            created_at,
            reviewed_at,
            users!teacher_requests_user_id_fkey ( email, full_name )
        `)
                        .order('created_at', { ascending: false });

                    if (error) {
                        console.error('❌ Error fetching teacher requests:', error);
                        return h.response({
                            error: 'Gagal mengambil data.',
                            details: error.message
                        }).code(500);
                    }

                    console.log('✅ Teacher requests found:', data?.length || 0);
                    console.log('📊 Raw data:', JSON.stringify(data, null, 2));

                    // Map data to include full_name and email at root level
                    const mappedData = data.map(item => ({
                        ...item,
                        full_name: item.users?.full_name || 'N/A',
                        email: item.users?.email || 'N/A'
                    }));

                    return h.response(mappedData);
                },
            },

            // GET: Check teacher request status (PUBLIC)
            {
                method: 'GET',
                path: '/teacher-requests/my-status',
                options: {
                    auth: false,
                    tags: ['api'],
                    description: 'Cek status pengajuan teacher request berdasarkan NIDN/NIP/Email (PUBLIC)',
                    validate: {
                        query: Joi.object({
                            nidn: Joi.string().pattern(/^\d{10,18}$/).optional(),
                            nip: Joi.string().pattern(/^\d{10,18}$/).optional(),
                            email: Joi.string().email().optional(),
                        }).or('nidn', 'nip', 'email')
                    }
                },
                handler: async (request, h) => {
                    const { nidn, nip, email } = request.query;

                    console.log('🔍 Checking teacher request status for:', { nidn, nip, email });

                    let query = supabase
                        .from('teacher_requests')
                        .select(`
                            id, 
                            status, 
                            created_at, 
                            reviewed_at,
                            reject_reason,
                            nidn,
                            nip,
                            institution,
                            users!teacher_requests_user_id_fkey ( email, full_name )
                        `)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    // Priority: NIDN > NIP > Email
                    if (nidn) {
                        query = query.eq('nidn', nidn.trim());
                    } else if (nip) {
                        query = query.eq('nip', nip.trim());
                    } else if (email) {
                        const { data: userData, error: userError } = await supabase
                            .from('users')
                            .select('id')
                            .eq('email', email.toLowerCase().trim())
                            .maybeSingle();

                        if (userError || !userData) {
                            return h.response({
                                status: 'not_found',
                                message: 'Tidak ada pengajuan ditemukan dengan email tersebut.'
                            }).code(404);
                        }

                        query = query.eq('user_id', userData.id);
                    }

                    const { data, error } = await query.maybeSingle();

                    if (error) {
                        console.error('Error fetching request status:', error);
                        return h.response({
                            error: 'Gagal mengambil status pengajuan.',
                            details: error.message
                        }).code(500);
                    }

                    if (!data) {
                        return h.response({
                            status: 'not_found',
                            message: 'Tidak ada pengajuan ditemukan dengan kriteria yang diberikan.'
                        }).code(404);
                    }

                    // Format response
                    const response = {
                        id: data.id,
                        status: data.status,
                        full_name: data.users?.full_name || 'N/A',
                        email: data.users?.email || 'N/A',
                        nidn: data.nidn,
                        nip: data.nip || null,
                        institution: data.institution || null,
                        created_at: data.created_at,
                        reviewed_at: data.reviewed_at || null,
                        message: getStatusMessage(data.status, data.reject_reason)
                    };

                    if (data.status === 'rejected' && data.reject_reason) {
                        response.reject_reason = data.reject_reason;
                    }

                    return h.response(response).code(200);
                },
            },

            // PATCH: Update teacher request status (admin only) - REQUIRES AUTH
            {
                method: 'PATCH',
                path: '/teacher-requests/{id}/status',
                options: {
                    // NO auth: false here - this needs authentication
                    tags: ['api'],
                    description: 'Update status pengajuan (admin only)',
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                        }),
                        payload: Joi.object({
                            status: Joi.string().valid('approved', 'rejected').required(),
                            reject_reason: Joi.string().max(500).optional().when('status', {
                                is: 'rejected',
                                then: Joi.required(),
                                otherwise: Joi.optional()
                            })
                        }),
                    },
                },
                handler: async (request, h) => {
                    const { role, id: reviewerId } = request.auth.credentials;
                    const { id } = request.params;
                    const { status, reject_reason } = request.payload;

                    if (role !== 'admin') {
                        return h.response({ error: 'Akses ditolak.' }).code(403);
                    }

                    // Get request data with user info
                    const { data: reqData, error: getErr } = await supabase
                        .from('teacher_requests')
                        .select(`
                            user_id, 
                           current_status:status,
                            users!teacher_requests_user_id_fkey ( email, full_name )
                        `)
                        .eq('id', id)
                        .single();

                    if (getErr || !reqData) {
                        console.error('Error fetching request data:', getErr);
                        return h.response({ error: 'Data pengajuan tidak ditemukan.' }).code(404);
                    }

                    const { user_id, users, current_status } = reqData;

                    // Check if status already changed
                    if (current_status !== 'pending') {
                        return h.response({
                            error: `Pengajuan sudah diproses dengan status: ${current_status}`
                        }).code(400);
                    }

                    // Update request status
                    const updateData = {
                        status,
                        reviewed_by: reviewerId,
                        reviewed_at: new Date(),
                        updated_at: new Date(),
                    };

                    if (status === 'rejected' && reject_reason) {
                        updateData.reject_reason = reject_reason;
                    }

                    const { error: updateErr } = await supabase
                        .from('teacher_requests')
                        .update(updateData)
                        .eq('id', id);

                    if (updateErr) {
                        console.error('Error updating request status:', updateErr);
                        return h.response({ error: 'Gagal mengupdate status.' }).code(500);
                    }

                    if (status === 'approved') {
                        // Generate magic token for password setup
                        const magicToken = crypto.randomUUID();
                        const magicExpiresAt = new Date();
                        magicExpiresAt.setHours(magicExpiresAt.getHours() + 168); // 24 hour expiry

                        const { error: updateUserErr } = await supabase
                            .from('users')
                            .update({
                                role: 'teacher',
                                is_verified: true, // Auto verify when approved as teacher
                                magic_token: magicToken,
                                magic_expires_at: magicExpiresAt.toISOString(),
                                updated_at: new Date()
                            })
                            .eq('id', user_id);

                        if (updateUserErr) {
                            console.error('Error updating user role:', updateUserErr);
                            // Rollback request status if failed
                            await supabase
                                .from('teacher_requests')
                                .update({ status: 'pending' })
                                .eq('id', id);

                            return h.response({
                                error: 'Gagal mengupdate role pengguna.'
                            }).code(500);
                        }

                        // Send email with magic link for password setup
                        if (users?.email) {
                            try {
                                // Gunakan getEnv untuk mendapatkan FRONTEND_BASE_URL
                                const frontendUrl = await getEnv('FRONTEND_BASE_URL');
                                const setupLink = `${frontendUrl}#/setup-teacher-password?token=${magicToken}`;

                                console.log('📧 Magic token generated:', magicToken);
                                console.log('🔗 Setup link:', setupLink);

                                // Kirim email dengan setup link
                                await sendTeacherRequestStatusEmail(users.email, status, users.full_name, setupLink);

                                console.log('✅ Approval email with setup link sent successfully');
                            } catch (emailErr) {
                                console.error('Error sending approval email:', emailErr);
                                // Tidak perlu rollback jika email gagal, user masih bisa request resend
                            }
                        }
                    } else if (status === 'rejected') {
                        // Untuk rejected, tidak perlu setup link
                        if (users?.email) {
                            try {
                                await sendTeacherRequestStatusEmail(users.email, status, users.full_name);
                                console.log('✅ Rejection email sent successfully');
                            } catch (emailErr) {
                                console.error('Error sending rejection email:', emailErr);
                            }
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