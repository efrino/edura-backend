const Joi = require('joi');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');
const Papa = require('papaparse');
const bcrypt = require('bcryptjs');

async function getUserListByRole(role, page, limit, search) {
    const offset = (page - 1) * limit;

    let query = db
        .from('users')
        .select('id, full_name, email, role, is_verified', { count: 'exact' })
        .eq('role', role)
        .order('full_name', { ascending: true })
        .range(offset, offset + limit - 1);

    if (search) {
        query = query.ilike('full_name', `%${search}%`);
    }

    return await query;
}

module.exports = {
    name: 'user-management',
    version: '1.0.0',
    register: async function (server) {
        // === IMPORT USERS DARI CSV ===
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
                        const usersToInsert = [];

                        for (const row of rows) {
                            const { full_name, email, role } = row;
                            if (!full_name || !email || !role) continue;
                            if (!['admin', 'teacher', 'student'].includes(role)) continue;

                            // Cek apakah email sudah digunakan
                            const { data: existingUser } = await db.from('users').select('id').eq('email', email).maybeSingle();
                            if (existingUser) continue;

                            const randomPassword = Math.random().toString(36).slice(-10);
                            const passwordHash = await bcrypt.hash(randomPassword, 10);

                            usersToInsert.push({
                                full_name,
                                email,
                                role,
                                password_hash: passwordHash,
                                is_verified: false,
                            });
                        }

                        if (usersToInsert.length === 0) {
                            return resolve(h.response({ message: 'Tidak ada data user yang valid untuk ditambahkan.' }).code(400));
                        }

                        const { error } = await db.from('users').insert(usersToInsert);

                        if (error) {
                            console.error(error);
                            return resolve(h.response({ message: 'Gagal import data user.' }).code(500));
                        }

                        return resolve(h.response({ message: 'Berhasil menambahkan user.', imported: usersToInsert.length }).code(201));
                    });

                    file.on('error', (err) => {
                        console.error(err);
                        return reject(h.response({ message: 'Gagal membaca file' }).code(500));
                    });
                });
            },
        });

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
                            search: Joi.string().optional(),
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
                        },
                    };
                },
            });
        }
    },
};