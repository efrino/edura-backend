const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { hashToken } = require('../utils/hash');
const {
    sendOtpEmail,
    sendMagicLinkEmail,
    sendPasswordResetLink,
    sendTeacherPasswordSetupEmail
} = require('../utils/email');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { getEnv } = require('../utils/env');

module.exports = {
    name: 'auth-routes',
    register: async function (server) {
        const routes = [

            // 🎉 POST /register
            {
                method: 'POST',
                path: '/register',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                            full_name: Joi.string().min(3).required(),
                            password: Joi.string().min(6).required(),
                            role: Joi.string().valid('student', 'teacher', 'admin').default('student'),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { email, full_name, password, role } = req.payload;

                    try {
                        const { data: existing, error: e1 } = await db
                            .from('users')
                            .select('id')
                            .eq('email', email)
                            .maybeSingle();

                        if (e1) throw new Error(e1.message);
                        if (existing) return h.response({ error: 'Email already registered' }).code(400);

                        const hashedPassword = await bcrypt.hash(password, 10);
                        const magicToken = uuidv4();
                        const magicExpires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

                        const { data: inserted, error: e2 } = await db.from('users').insert({
                            email,
                            full_name,
                            password_hash: hashedPassword,
                            role,
                            is_verified: false,
                            magic_token: magicToken,
                            magic_expires_at: magicExpires
                        }).select('id').single();

                        if (e2) throw new Error(e2.message);
                        await sendMagicLinkEmail(email, magicToken);

                        return h.response({ message: 'Registration successful. Please check your email to verify your account.' }).code(201);
                    } catch (err) {
                        console.error('🔥 Error /register', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },

            // 🔗 GET /verify-email
            {
                method: 'GET',
                path: '/verify-email',
                options: {
                    tags: ['api'],
                    validate: {
                        query: Joi.object({
                            token: Joi.string().uuid().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { token } = req.query;
                    try {
                        const { data: user, error: e1 } = await db
                            .from('users')
                            .select('*')
                            .eq('magic_token', token)
                            .maybeSingle();

                        if (e1) throw e1;
                        if (!user) return h.response({ error: 'Invalid token' }).code(400);
                        if (new Date() > new Date(user.magic_expires_at)) {
                            return h.response({ error: 'Token expired' }).code(400);
                        }

                        const { error: e2 } = await db.from('users').update({
                            is_verified: true,
                            magic_token: null,
                            magic_expires_at: null
                        }).eq('id', user.id);
                        if (e2) throw new Error(e2.message);

                        return h.response({ message: 'Email verified successfully!' });
                    } catch (err) {
                        console.error('🔥 Error /verify-email', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },

            // 🔐 POST /login (revised to handle teacher request pending)
            {
                method: 'POST',
                path: '/login',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                            password: Joi.string().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { email, password } = req.payload;

                    try {
                        const { data: user, error: e1 } = await db
                            .from('users')
                            .select('*')
                            .eq('email', email)
                            .maybeSingle();

                        if (e1) throw new Error(e1.message);
                        if (!user) {
                            return h.response({ error: 'Email not registered' }).code(404);
                        }

                        // Check if this is a teacher request pending account
                        if (user.password_hash.startsWith('!TEACHER_REQUEST_PENDING!')) {
                            // Check teacher request status
                            const { data: teacherRequest } = await db
                                .from('teacher_requests')
                                .select('status')
                                .eq('user_id', user.id)
                                .order('created_at', { ascending: false })
                                .limit(1)
                                .maybeSingle();

                            if (teacherRequest) {
                                if (teacherRequest.status === 'pending') {
                                    return h.response({
                                        error: 'Akun Anda sedang dalam proses verifikasi teacher request. Silakan tunggu persetujuan dari admin.',
                                        code: 'TEACHER_REQUEST_PENDING',
                                        status: 'pending'
                                    }).code(403);
                                } else if (teacherRequest.status === 'rejected') {
                                    return h.response({
                                        error: 'Teacher request Anda telah ditolak. Silakan hubungi admin untuk informasi lebih lanjut.',
                                        code: 'TEACHER_REQUEST_REJECTED',
                                        status: 'rejected'
                                    }).code(403);
                                } else if (teacherRequest.status === 'approved' && user.magic_token) {
                                    return h.response({
                                        error: 'Teacher request Anda telah disetujui. Silakan cek email untuk setup password.',
                                        code: 'TEACHER_REQUEST_APPROVED_NEEDS_SETUP',
                                        status: 'approved',
                                        needs_password_setup: true
                                    }).code(403);
                                }
                            }
                        }

                        if (!user.is_verified) {
                            const magicToken = uuidv4();
                            const magicExpires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

                            await db.from('users').update({
                                magic_token: magicToken,
                                magic_expires_at: magicExpires
                            }).eq('id', user.id);

                            await sendMagicLinkEmail(email, magicToken);
                            return h.response({
                                error: 'Email not verified. We have sent a new verification link to your email.'
                            }).code(401);
                        }

                        const match = await bcrypt.compare(password, user.password_hash);
                        if (!match) return h.response({ error: 'Invalid credentials' }).code(401);

                        const otp = Math.floor(100000 + Math.random() * 900000).toString();
                        const expiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

                        const { error: e2 } = await db.from('users').update({
                            otp_code: otp,
                            otp_expires_at: expiry
                        }).eq('id', user.id);
                        if (e2) throw new Error(e2.message);

                        await sendOtpEmail(email, otp);
                        return { message: 'OTP sent to your email' };
                    } catch (err) {
                        console.error('🔥 Error /login', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },

            // 🔁 POST /send-magic-link - kirim ulang magic link
            {
                method: 'POST',
                path: '/send-magic-link',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { email } = req.payload;

                    try {
                        const { data: user, error: e1 } = await db
                            .from('users')
                            .select('*')
                            .eq('email', email)
                            .maybeSingle();

                        if (e1) throw new Error(e1.message);
                        if (!user) return h.response({ error: 'Email not found' }).code(404);
                        if (user.is_verified) return h.response({ error: 'Email already verified' }).code(400);

                        const magicToken = uuidv4();
                        const magicExpires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

                        const { error: e2 } = await db.from('users').update({
                            magic_token: magicToken,
                            magic_expires_at: magicExpires
                        }).eq('id', user.id);
                        if (e2) throw new Error(e2.message);

                        await sendMagicLinkEmail(email, magicToken);
                        return { message: 'Magic link resent to email' };
                    } catch (err) {
                        console.error('🔥 Error /send-magic-link', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },

            // 🆕 POST /setup-teacher-password - Setup password untuk teacher yang approved
            {
                method: 'POST',
                path: '/setup-teacher-password',
                options: {
                    tags: ['api'],
                    description: 'Setup password untuk teacher yang sudah di-approve',
                    validate: {
                        payload: Joi.object({
                            token: Joi.string().uuid().required(),
                            password: Joi.string().min(8).required()
                                .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                                .message('Password must contain at least one uppercase letter, one lowercase letter, and one number')
                        })
                    }
                },
                handler: async (req, h) => {
                    const { token, password } = req.payload;

                    try {
                        // Find user with valid magic token
                        const { data: user, error } = await db
                            .from('users')
                            .select('id, email, role, magic_expires_at, password_hash')
                            .eq('magic_token', token)
                            .maybeSingle();

                        if (error) {
                            console.error('Error finding user:', error);
                            throw error;
                        }

                        if (!user) {
                            return h.response({ error: 'Token tidak valid' }).code(400);
                        }

                        // Check if user is a teacher
                        if (user.role !== 'teacher') {
                            return h.response({ error: 'Token ini hanya untuk setup password teacher' }).code(403);
                        }

                        // Check if password is still the unusable one
                        if (!user.password_hash.startsWith('!TEACHER_REQUEST_PENDING!')) {
                            return h.response({ error: 'Password sudah di-setup sebelumnya' }).code(400);
                        }

                        // Check token expiry
                        if (new Date() > new Date(user.magic_expires_at)) {
                            return h.response({ error: 'Token sudah kadaluarsa' }).code(400);
                        }

                        // Hash new password
                        const passwordHash = await bcrypt.hash(password, 10);

                        // Update user password and clear magic token
                        const { error: updateErr } = await db
                            .from('users')
                            .update({
                                password_hash: passwordHash,
                                magic_token: null,
                                magic_expires_at: null,
                                is_verified: true, // Auto verify when setting up password
                                updated_at: new Date()
                            })
                            .eq('id', user.id);

                        if (updateErr) {
                            console.error('Error updating password:', updateErr);
                            return h.response({ error: 'Gagal setup password' }).code(500);
                        }

                        // Generate JWT token for auto-login
                        const jwtSecret = await getEnv('JWT_SECRET');
                        const jwtToken = jwt.sign(
                            {
                                id: user.id,
                                email: user.email,
                                role: 'teacher'
                            },
                            jwtSecret,
                            { expiresIn: '7d' }
                        );

                        console.log('✅ Teacher password setup successful for:', user.email);

                        return h.response({
                            message: 'Password berhasil diatur. Anda sekarang dapat login sebagai teacher.',
                            token: jwtToken,
                            user: {
                                id: user.id,
                                email: user.email,
                                role: 'teacher'
                            }
                        });

                    } catch (err) {
                        console.error('🔥 Error /setup-teacher-password', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                }
            },

            // 🆕 POST /resend-teacher-setup-link - Kirim ulang link setup password untuk teacher
            {
                method: 'POST',
                path: '/resend-teacher-setup-link',
                options: {
                    tags: ['api'],
                    description: 'Kirim ulang link setup password untuk teacher yang approved',
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const { email } = req.payload;

                    try {
                        // Find user
                        const { data: user, error } = await db
                            .from('users')
                            .select('id, role, password_hash, full_name')
                            .eq('email', email)
                            .maybeSingle();

                        if (error || !user) {
                            return h.response({ error: 'Email tidak ditemukan' }).code(404);
                        }

                        // Check if user is teacher with pending password
                        if (user.role !== 'teacher') {
                            return h.response({ error: 'Fitur ini hanya untuk teacher' }).code(403);
                        }

                        if (!user.password_hash.startsWith('!TEACHER_REQUEST_PENDING!')) {
                            return h.response({ error: 'Password sudah di-setup. Gunakan forgot password jika lupa.' }).code(400);
                        }

                        // Generate new magic token
                        const magicToken = uuidv4();
                        const magicExpires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

                        // Update user with new token
                        const { error: updateErr } = await db
                            .from('users')
                            .update({
                                magic_token: magicToken,
                                magic_expires_at: magicExpires
                            })
                            .eq('id', user.id);

                        if (updateErr) {
                            throw updateErr;
                        }

                        // Generate setup link
                        const frontendUrl = await getEnv('FRONTEND_BASE_URL');
                        const setupLink = `${frontendUrl}#/setup-teacher-password?token=${magicToken}`;

                        // Send email dengan setup link - PERBAIKAN: Hapus comment dan panggil fungsi
                        await sendTeacherPasswordSetupEmail(email, user.full_name, setupLink);

                        console.log('✅ Teacher setup link resent to:', email);

                        return h.response({
                            message: 'Link setup password telah dikirim ke email Anda.'
                        });

                    } catch (err) {
                        console.error('🔥 Error /resend-teacher-setup-link', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                }
            },

            {
                method: 'POST',
                path: '/forgot-password',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { email } = req.payload;

                    try {
                        const { data: user, error } = await db
                            .from('users')
                            .select('id, email, password_hash')
                            .eq('email', email)
                            .maybeSingle();

                        if (error) {
                            console.error('❌ [Forgot Password] Supabase error:', error.message);
                            throw error;
                        }

                        // Tetap response netral untuk keamanan
                        if (!user) {
                            console.warn('⚠️ [Forgot Password] Email tidak ditemukan:', email);
                            return { message: 'If this email is registered, a reset link has been sent.' };
                        }

                        // Check if this is teacher with pending password setup
                        if (user.password_hash.startsWith('!TEACHER_REQUEST_PENDING!')) {
                            return h.response({
                                error: 'Akun teacher Anda belum setup password. Silakan gunakan link setup password dari email approval.',
                                code: 'TEACHER_PASSWORD_NOT_SET'
                            }).code(400);
                        }

                        const token = uuidv4();
                        const hashedToken = hashToken(token);
                        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 jam dari sekarang

                        await db.from('users').update({
                            reset_token: hashedToken,
                            reset_expires_at: expiresAt.toISOString(),
                        }).eq('id', user.id);

                        await sendPasswordResetLink(email, token);

                        console.log('📧 [Forgot Password] Reset link sent to:', email);

                        return { message: 'If this email is registered, a reset link has been sent.' };
                    } catch (err) {
                        console.error('🔥 [Forgot Password] Internal error:', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                }
            },

            {
                method: 'POST',
                path: '/reset-password',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            token: Joi.string().required(),
                            new_password: Joi.string().min(6).required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { token, new_password } = req.payload;
                    const hashedToken = hashToken(token);

                    // 🧾 Log input token & hashed token
                    console.log('🔑 [Reset Password] Token (plain):', token);
                    console.log('🔒 [Reset Password] Token (hashed):', hashedToken);

                    try {
                        const { data: user, error } = await db
                            .from('users')
                            .select('*')
                            .eq('reset_token', hashedToken)
                            .maybeSingle();

                        // 🧾 Log hasil query ke Supabase
                        if (error) {
                            console.error('❌ [Reset Password] Supabase error:', error.message);
                            throw error;
                        }

                        if (!user) {
                            console.warn('⚠️ [Reset Password] Token tidak cocok dengan user manapun');
                            return h.response({ error: 'Invalid or expired token' }).code(401);
                        }

                        console.log('✅ [Reset Password] User ditemukan:', user.email || user.id);

                        if (!user.reset_expires_at) {
                            console.warn('⚠️ [Reset Password] Tidak ada field reset_expires_at');
                            return h.response({ error: 'Invalid or expired token' }).code(401);
                        }

                        const now = Date.now();
                        const expiresAt = new Date(user.reset_expires_at).getTime();

                        console.log('🕒 [Reset Password] Sekarang:', new Date(now).toISOString());
                        console.log('🕓 [Reset Password] Expired At:', new Date(expiresAt).toISOString());

                        if (now > expiresAt) {
                            console.warn('⚠️ [Reset Password] Token sudah expired');
                            return h.response({ error: 'Invalid or expired token' }).code(401);
                        }

                        const hashedPassword = await bcrypt.hash(new_password, 10);

                        await db.from('users').update({
                            password_hash: hashedPassword,
                            reset_token: null,
                            reset_expires_at: null
                        }).eq('id', user.id);

                        console.log('✅ [Reset Password] Password berhasil direset untuk:', user.email || user.id);

                        return { message: 'Password has been reset successfully' };

                    } catch (err) {
                        console.error('🔥 Error /reset-password', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                }
            },

            // ✅ POST /verify-otp
            {
                method: 'POST',
                path: '/verify-otp',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                            otp: Joi.string().length(6).required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { email, otp } = req.payload;

                    try {
                        const { data: user, error: e1 } = await db
                            .from('users')
                            .select('*')
                            .eq('email', email)
                            .maybeSingle();

                        if (e1) throw new Error(e1.message);
                        if (!user) return h.response({ error: 'User not found' }).code(404);
                        if (user.otp_code !== otp || new Date() > new Date(user.otp_expires_at)) {
                            return h.response({ error: 'Invalid or expired OTP' }).code(401);
                        }

                        // ✅ Bersihkan OTP
                        const { error: e2 } = await db.from('users').update({
                            otp_code: null,
                            otp_expires_at: null
                        }).eq('id', user.id);
                        if (e2) throw new Error(e2.message);

                        // ✅ Ambil JWT_SECRET dari env_config
                        const jwtSecret = await getEnv('JWT_SECRET');

                        // ✅ Buat JWT token
                        const token = jwt.sign(
                            {
                                id: user.id,
                                email: user.email,
                                role: user.role
                            },
                            jwtSecret,
                            { expiresIn: '7d' } // token berlaku 7 hari
                        );

                        return {
                            message: 'OTP verified. Login successful.',
                            token,
                            user_id: user.id,
                            role: user.role
                        };
                    } catch (err) {
                        console.error('🔥 Error /verify-otp', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },

            {
                method: 'POST',
                path: '/resend-otp',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { email } = req.payload;

                    try {
                        const { data: user, error: e1 } = await db
                            .from('users')
                            .select('*')
                            .eq('email', email)
                            .maybeSingle();

                        if (e1) throw new Error(e1.message);
                        if (!user) return h.response({ error: 'Email not found' }).code(404);
                        if (!user.is_verified) return h.response({ error: 'Email not verified' }).code(401);

                        const now = new Date();
                        const isExpired = !user.otp_expires_at || new Date(user.otp_expires_at) < now;

                        if (!isExpired) {
                            return h.response({ message: 'OTP is still valid. Please check your email.' });
                        }

                        const otp = Math.floor(100000 + Math.random() * 900000).toString();
                        const expiry = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

                        await db.from('users').update({
                            otp_code: otp,
                            otp_expires_at: expiry
                        }).eq('id', user.id);

                        await sendOtpEmail(email, otp);
                        return { message: 'New OTP sent to your email' };
                    } catch (err) {
                        console.error('🔥 Error /resend-otp', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },
        ];

        // Tambahkan tag 'Authentikasi' ke semua route
        routes.forEach(route => {
            if (route.options && Array.isArray(route.options.tags)) {
                route.options.tags.push('Authentikasi');
            }
        });

        server.route(routes);
    },
};