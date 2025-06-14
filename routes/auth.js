const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // ✅ tambahkan ini
const db = require('../db');
const {
    sendOtpEmail,
    sendMagicLinkEmail,
    sendPasswordResetOtp
} = require('../utils/email');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config(); // pastikan juga baris ini ada

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

                        if (e1) throw e1;
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

                        if (e2) throw e2;
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
                        if (e2) throw e2;

                        return h.response({ message: 'Email verified successfully!' });
                    } catch (err) {
                        console.error('🔥 Error /verify-email', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },

            // 🔐 POST /login (password only, must is_verified)
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

                        if (e1) throw e1;
                        if (!user) {
                            return h.response({ error: 'Email not registered' }).code(404);
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
                        if (e2) throw e2;

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

                        if (e1) throw e1;
                        if (!user) return h.response({ error: 'Email not found' }).code(404);
                        if (user.is_verified) return h.response({ error: 'Email already verified' }).code(400);

                        const magicToken = uuidv4();
                        const magicExpires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

                        const { error: e2 } = await db.from('users').update({
                            magic_token: magicToken,
                            magic_expires_at: magicExpires
                        }).eq('id', user.id);
                        if (e2) throw e2;

                        await sendMagicLinkEmail(email, magicToken);
                        return { message: 'Magic link resent to email' };
                    } catch (err) {
                        console.error('🔥 Error /send-magic-link', err);
                        return h.response({ error: 'Internal Server Error' }).code(500);
                    }
                },
            },


            // 🔁 POST /forgot-password - kirim OTP
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
                    const { rows } = await db.query('SELECT * FROM public.users WHERE email = $1', [email]);
                    if (rows.length === 0) return h.response({ error: 'Email not found' }).code(404);

                    const otp = Math.floor(100000 + Math.random() * 900000).toString();
                    const expiry = new Date(Date.now() + 5 * 60000);

                    await db.query(`
                        UPDATE public.users SET otp_code = $1, otp_expires_at = $2 WHERE email = $3
                    `, [otp, expiry, email]);

                    await sendPasswordResetOtp(email, otp);
                    return { message: 'OTP sent to email for password reset' };
                },
            },

            // 🔁 POST /reset-password - validasi OTP lalu reset password
            {
                method: 'POST',
                path: '/reset-password',
                options: {
                    tags: ['api'],
                    validate: {
                        payload: Joi.object({
                            email: Joi.string().email().required(),
                            otp: Joi.string().required(),
                            new_password: Joi.string().min(6).required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { email, otp, new_password } = req.payload;

                    const { rows } = await db.query('SELECT * FROM public.users WHERE email = $1', [email]);
                    if (rows.length === 0) return h.response({ error: 'Email not found' }).code(404);

                    const user = rows[0];
                    if (user.otp_code !== otp || new Date() > new Date(user.otp_expires_at)) {
                        return h.response({ error: 'Invalid or expired OTP' }).code(401);
                    }

                    const hashedPassword = await bcrypt.hash(new_password, 10);
                    await db.query(`
                        UPDATE public.users
                        SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL
                        WHERE email = $2
                    `, [hashedPassword, email]);

                    return { message: 'Password has been reset successfully' };
                },
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

                        if (e1) throw e1;
                        if (!user) return h.response({ error: 'User not found' }).code(404);
                        if (user.otp_code !== otp || new Date() > new Date(user.otp_expires_at)) {
                            return h.response({ error: 'Invalid or expired OTP' }).code(401);
                        }

                        // ✅ Bersihkan OTP
                        const { error: e2 } = await db.from('users').update({
                            otp_code: null,
                            otp_expires_at: null
                        }).eq('id', user.id);
                        if (e2) throw e2;

                        // ✅ Buat JWT token
                        const token = jwt.sign(
                            {
                                id: user.id,
                                email: user.email,
                                role: user.role
                            },
                            process.env.JWT_SECRET,
                            { expiresIn: '1h' } // expired dalam 1 jam
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
