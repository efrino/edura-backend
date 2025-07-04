// Backend: manage-payment.js
const Joi = require('joi');
const Boom = require('@hapi/boom');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'manage-payment',
    version: '1.0.0',
    register: async function (server) {
        // === GET /admin/payments
        server.route({
            method: 'GET',
            path: '/admin/payments',
            options: {
                tags: ['api', 'Payment'],
                description: 'List payment logs (admin only) dengan fitur pagination, search, dan filter',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    query: Joi.object({
                        page: Joi.number().integer().min(1).default(1),
                        limit: Joi.number().integer().min(1).max(100).default(10),
                        search: Joi.string().allow('', null),
                        email: Joi.string().email().allow('', null),
                    }),
                },
            },
            handler: async (req, h) => {
                const { page, limit, search, email } = req.query;
                const offset = (page - 1) * limit;

                let query = db
                    .from('payment_logs')
                    .select('*', { count: 'exact' })
                    .order('created_at', { ascending: false });

                if (search) {
                    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,order_id.ilike.%${search}%`);
                }

                if (email) {
                    query = query.eq('email', email);
                }

                query = query.range(offset, offset + limit - 1);

                const { data, count, error } = await query;

                if (error) {
                    console.error('❌ Error saat ambil data pembayaran:', error);
                    throw Boom.internal('Gagal mengambil payment logs');
                }

                return h.response({
                    data,
                    page,
                    total: count,
                    totalPages: Math.ceil(count / limit),
                });
            }
        });


        // === GET /admin/payments/{id}
        server.route({
            method: 'GET',
            path: '/admin/payments/{id}',
            options: {
                tags: ['api', 'Payment'],
                description: 'Get detail payment log by id (admin only)',
                pre: [verifyToken, requireRole('admin')],
            },
            handler: async (req, h) => {
                const id = req.params.id;
                const { data, error } = await db
                    .from('payment_logs')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();

                if (error || !data) {
                    throw Boom.notFound('Log pembayaran tidak ditemukan');
                }

                return h.response(data).code(200);
            }
        });

        // === DELETE /admin/payments/{id}
        server.route({
            method: 'DELETE',
            path: '/admin/payments/{id}',
            options: {
                tags: ['api', 'Payment'],
                description: 'Hapus log pembayaran (admin only)',
                pre: [verifyToken, requireRole('admin')],
            },
            handler: async (req, h) => {
                const id = req.params.id;

                const { error } = await db
                    .from('payment_logs')
                    .delete()
                    .eq('id', id);

                if (error) throw Boom.internal('Gagal menghapus log pembayaran');

                return h.response({ message: 'Log pembayaran berhasil dihapus' });
            }
        });
    }
};
