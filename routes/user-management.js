const Joi = require('joi');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');
const Papa = require('papaparse');
const bcrypt = require('bcryptjs');
const { sendNewUserCredentialsEmail } = require('../utils/email');

async function getUserListByRole(role, page, limit, search) {
    const offset = (page - 1) * limit;

    let query = db
        .from('users')
        .select('id, full_name, email, role, is_verified, created_at, plan, plan_expires_at', { count: 'exact' })
        .eq('role', role)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    return await query;
}

module.exports = {
    name: 'user-management',
    version: '1.0.0',
    register: async function (server) {
        // === GET USER BY ID ===
        server.route({
            method: 'GET',
            path: '/management/user/{userId}',
            options: {
                tags: ['api', 'Management'],
                description: 'Get user details by ID',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    params: Joi.object({
                        userId: Joi.string().uuid().required()
                    })
                }
            },
            handler: async (request, h) => {
                const { userId } = request.params;

                const { data: user, error } = await db
                    .from('users')
                    .select('id, full_name, email, role, is_verified, created_at, plan, plan_expires_at')
                    .eq('id', userId)
                    .single();

                if (error || !user) {
                    return h.response({ message: 'User tidak ditemukan' }).code(404);
                }

                // Get additional profile data based on role
                if (user.role === 'student') {
                    const { data: profile } = await db
                        .from('student_profiles')
                        .select('*')
                        .eq('user_id', userId)
                        .maybeSingle();
                    user.profile = profile;
                } else if (user.role === 'teacher') {
                    const { data: profile } = await db
                        .from('teacher_profiles')
                        .select('*')
                        .eq('user_id', userId)
                        .maybeSingle();
                    user.profile = profile;
                }

                return user;
            }
        });

        // === CREATE NEW USER ===
        server.route({
            method: 'POST',
            path: '/management/user',
            options: {
                tags: ['api', 'Management'],
                description: 'Create new user (admin only)',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    payload: Joi.object({
                        full_name: Joi.string().min(2).max(100).required(),
                        email: Joi.string().email().required(),
                        role: Joi.string().valid('student', 'teacher', 'admin').required(),
                        // Izinkan nilai null atau string kosong ('')
                        password: Joi.string().min(6).optional().allow(null, ''),
                        send_credentials: Joi.boolean().default(true)
                    })
                }
            },
            handler: async (request, h) => {
                const { full_name, email, role, password, send_credentials } = request.payload;

                // Check if email already exists
                const { data: existing } = await db
                    .from('users')
                    .select('id')
                    .eq('email', email)
                    .maybeSingle();

                if (existing) {
                    return h.response({ message: 'Email sudah terdaftar' }).code(400);
                }

                // Generate password if not provided
                const userPassword = password || Math.random().toString(36).slice(-10);
                const passwordHash = await bcrypt.hash(userPassword, 10);

                // Create user
                const { data: newUser, error } = await db
                    .from('users')
                    .insert({
                        full_name,
                        email,
                        role,
                        password_hash: passwordHash,
                        is_verified: false
                    })
                    .select()
                    .single();

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal membuat user' }).code(500);
                }

                // 2. Ganti blok pengiriman email dengan panggilan fungsi baru
                if (send_credentials) {
                    try {
                        await sendNewUserCredentialsEmail({
                            to: email,
                            fullName: full_name,
                            email: email,
                            password: userPassword,
                            role: role
                        });
                    } catch (emailError) {
                        console.error('Failed to send credentials email:', emailError);
                        // Anda bisa menambahkan log atau penanganan error di sini,
                        // namun proses pembuatan user tetap berhasil.
                    }
                }

                return h.response({
                    message: 'User berhasil dibuat',
                    user: {
                        id: newUser.id,
                        full_name: newUser.full_name,
                        email: newUser.email,
                        role: newUser.role
                    }
                }).code(201);
            }
        });


        // === UPDATE USER ===
        server.route({
            method: 'PUT',
            path: '/management/user/{userId}',
            options: {
                tags: ['api', 'Management'],
                description: 'Update user details',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    params: Joi.object({
                        userId: Joi.string().uuid().required()
                    }),
                    payload: Joi.object({
                        full_name: Joi.string().min(2).max(100).optional(),
                        email: Joi.string().email().optional(),
                        role: Joi.string().valid('student', 'teacher', 'admin').optional(),
                        is_verified: Joi.boolean().optional(),
                        plan: Joi.string().valid('free', 'premium').optional(),
                        plan_expires_at: Joi.date().iso().allow(null).optional()
                    })
                }
            },
            handler: async (request, h) => {
                const { userId } = request.params;
                const updateData = request.payload;

                // Check if user exists
                const { data: existing } = await db
                    .from('users')
                    .select('id')
                    .eq('id', userId)
                    .single();

                if (!existing) {
                    return h.response({ message: 'User tidak ditemukan' }).code(404);
                }

                // If email is being changed, check for duplicates
                if (updateData.email) {
                    const { data: emailExists } = await db
                        .from('users')
                        .select('id')
                        .eq('email', updateData.email)
                        .neq('id', userId)
                        .maybeSingle();

                    if (emailExists) {
                        return h.response({ message: 'Email sudah digunakan' }).code(400);
                    }
                }

                // Update user
                const { data: updated, error } = await db
                    .from('users')
                    .update(updateData)
                    .eq('id', userId)
                    .select()
                    .single();

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal update user' }).code(500);
                }

                return {
                    message: 'User berhasil diupdate',
                    user: updated
                };
            }
        });

        // === DELETE USER ===
        server.route({
            method: 'DELETE',
            path: '/management/user/{userId}',
            options: {
                tags: ['api', 'Management'],
                description: 'Delete user (admin only)',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    params: Joi.object({
                        userId: Joi.string().uuid().required()
                    })
                }
            },
            handler: async (request, h) => {
                const { userId } = request.params;
                const adminId = request.auth.credentials.id;

                // Prevent self-deletion
                if (userId === adminId) {
                    return h.response({ message: 'Tidak dapat menghapus akun sendiri' }).code(400);
                }

                // Check if user exists
                const { data: user } = await db
                    .from('users')
                    .select('id, role')
                    .eq('id', userId)
                    .single();

                if (!user) {
                    return h.response({ message: 'User tidak ditemukan' }).code(404);
                }

                // Delete user (cascade will handle related records)
                const { error } = await db
                    .from('users')
                    .delete()
                    .eq('id', userId);

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal menghapus user' }).code(500);
                }

                return { message: 'User berhasil dihapus' };
            }
        });

        // === RESET USER PASSWORD ===
        server.route({
            method: 'POST',
            path: '/management/user/{userId}/reset-password',
            options: {
                tags: ['api', 'Management'],
                description: 'Reset user password',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    params: Joi.object({
                        userId: Joi.string().uuid().required()
                    }),
                    payload: Joi.object({
                        new_password: Joi.string().min(6).optional(),
                        send_email: Joi.boolean().default(true)
                    })
                }
            },
            handler: async (request, h) => {
                const { userId } = request.params;
                const { new_password, send_email } = request.payload;

                // Get user
                const { data: user } = await db
                    .from('users')
                    .select('id, email, full_name')
                    .eq('id', userId)
                    .single();

                if (!user) {
                    return h.response({ message: 'User tidak ditemukan' }).code(404);
                }

                // Generate new password if not provided
                const password = new_password || Math.random().toString(36).slice(-10);
                const passwordHash = await bcrypt.hash(password, 10);

                // Update password
                const { error } = await db
                    .from('users')
                    .update({ password_hash: passwordHash })
                    .eq('id', userId);

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal reset password' }).code(500);
                }

                // Send email if requested
                if (send_email) {
                    try {
                        await sendEmail({
                            to: user.email,
                            subject: 'Password Anda Telah Direset',
                            html: `
                                <h2>Password Reset</h2>
                                <p>Halo ${user.full_name},</p>
                                <p>Password Anda telah direset oleh administrator.</p>
                                <p><strong>Password baru:</strong> ${password}</p>
                                <p>Silakan login dan ubah password ini segera.</p>
                            `
                        });
                    } catch (emailError) {
                        console.error('Failed to send password reset email:', emailError);
                    }
                }

                return {
                    message: 'Password berhasil direset',
                    temporary_password: send_email ? null : password
                };
            }
        });

        // === IMPORT USERS FROM CSV ===
        server.route({
            method: 'POST',
            path: '/management/import-users',
            options: {
                tags: ['api', 'Management'],
                description: 'Import user data from CSV file (admin only)',
                pre: [verifyToken, requireRole('admin')],
                payload: {
                    output: 'stream',
                    parse: true,
                    multipart: true,
                    allow: 'multipart/form-data',
                    maxBytes: 5 * 1024 * 1024,
                },
                validate: {
                    payload: Joi.object({
                        file: Joi.any().required(),
                    }),
                },
            },
            handler: async (request, h) => {
                const file = request.payload.file;

                return new Promise((resolve, reject) => {
                    let csvData = '';

                    file.on('data', (chunk) => {
                        csvData += chunk;
                    });

                    file.on('end', async () => {
                        const parsed = Papa.parse(csvData, {
                            header: true,
                            skipEmptyLines: true,
                        });

                        if (parsed.errors.length > 0) {
                            console.error(parsed.errors);
                            return resolve(h.response({ message: 'Format CSV tidak valid' }).code(400));
                        }

                        const rows = parsed.data;
                        const results = {
                            success: 0,
                            failed: 0,
                            errors: []
                        };

                        for (const row of rows) {
                            const { full_name, email, role, password } = row;

                            if (!full_name || !email || !role) {
                                results.failed++;
                                results.errors.push(`Row missing required fields: ${JSON.stringify(row)}`);
                                continue;
                            }

                            if (!['admin', 'teacher', 'student'].includes(role)) {
                                results.failed++;
                                results.errors.push(`Invalid role for ${email}: ${role}`);
                                continue;
                            }

                            // Check if email already exists
                            const { data: existingUser } = await db
                                .from('users')
                                .select('id')
                                .eq('email', email)
                                .maybeSingle();

                            if (existingUser) {
                                results.failed++;
                                results.errors.push(`Email already exists: ${email}`);
                                continue;
                            }

                            const userPassword = password || Math.random().toString(36).slice(-10);
                            const passwordHash = await bcrypt.hash(userPassword, 10);

                            const { error } = await db.from('users').insert({
                                full_name,
                                email,
                                role,
                                password_hash: passwordHash,
                                is_verified: false,
                            });

                            if (error) {
                                results.failed++;
                                results.errors.push(`Failed to create ${email}: ${error.message}`);
                            } else {
                                results.success++;
                            }
                        }

                        return resolve(h.response({
                            message: `Import completed. Success: ${results.success}, Failed: ${results.failed}`,
                            details: results
                        }).code(201));
                    });

                    file.on('error', (err) => {
                        console.error(err);
                        return reject(h.response({ message: 'Gagal membaca file' }).code(500));
                    });
                });
            },
        });

        // === GET USERS BY ROLE ===
        const roles = ['student', 'teacher', 'admin'];

        for (const role of roles) {
            server.route({
                method: 'GET',
                path: `/management/list-${role}`,
                options: {
                    tags: ['api', 'Management'],
                    description: `Get list of ${role}s`,
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        query: Joi.object({
                            page: Joi.number().integer().min(1).default(1),
                            limit: Joi.number().integer().min(1).max(100).default(10),
                            search: Joi.string().optional().allow(''),
                        }),
                    },
                },
                handler: async (request, h) => {
                    const { page, limit, search } = request.query;

                    const { data, count, error } = await getUserListByRole(role, page, limit, search);

                    if (error) {
                        console.error(error);
                        return h.response({ message: `Gagal mengambil daftar ${role}` }).code(500);
                    }

                    return {
                        data,
                        pagination: {
                            page,
                            limit,
                            total: count,
                            totalPages: Math.ceil(count / limit)
                        },
                    };
                },
            });
        }

        // === EXPORT USERS TO CSV ===
        server.route({
            method: 'GET',
            path: '/management/export-users',
            options: {
                tags: ['api', 'Management'],
                description: 'Export users to CSV',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    query: Joi.object({
                        role: Joi.string().valid('student', 'teacher', 'admin', 'all').default('all')
                    })
                }
            },
            handler: async (request, h) => {
                const { role } = request.query;

                let query = db
                    .from('users')
                    .select('full_name, email, role, is_verified, created_at')
                    .order('created_at', { ascending: false });

                if (role !== 'all') {
                    query = query.eq('role', role);
                }

                const { data, error } = await query;

                if (error) {
                    console.error(error);
                    return h.response({ message: 'Gagal export data' }).code(500);
                }

                const csv = Papa.unparse(data);

                return h.response(csv)
                    .type('text/csv')
                    .header('Content-Disposition', `attachment; filename=users-${role}-${Date.now()}.csv`);
            }
        });
    },
};