// Backend: manage-payment.js (Fixed Structure)
const Joi = require('joi');
const Boom = require('@hapi/boom');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'manage-payment',
    version: '1.0.0',
    register: async function (server) {

        // === GET /admin/payments - List payments with enhanced filtering
        server.route({
            method: 'GET',
            path: '/admin/payments',
            options: {
                tags: ['api', 'Payment'],
                description: 'List payment logs (admin only) dengan fitur pagination, search, dan filter yang diperluas',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    query: Joi.object({
                        page: Joi.number().integer().min(1).default(1),
                        limit: Joi.number().integer().min(1).max(1000).default(10),
                        search: Joi.string().allow('', null).optional(),
                        status: Joi.string().valid('settlement', 'pending', 'expire', 'cancel', 'failure').allow('', null).optional(),
                        date: Joi.date().iso().allow('', null).optional(),
                        email: Joi.string().email().allow('', null).optional(),
                        order_id: Joi.string().allow('', null).optional()
                    }),
                },
            },
            handler: async (req, h) => {
                try {
                    const { page, limit, search, status, date, email, order_id } = req.query;
                    const offset = (page - 1) * limit;

                    let query = db
                        .from('payment_logs')
                        .select('*', { count: 'exact' })
                        .order('created_at', { ascending: false });

                    // Apply search filter
                    if (search && search.trim()) {
                        query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%,order_id.ilike.%${search.trim()}%,product.ilike.%${search.trim()}%`);
                    }

                    // Apply status filter
                    if (status && status.trim()) {
                        query = query.eq('status', status.trim());
                    }

                    // Apply email filter
                    if (email && email.trim()) {
                        query = query.eq('email', email.trim());
                    }

                    // Apply order_id filter
                    if (order_id && order_id.trim()) {
                        query = query.eq('order_id', order_id.trim());
                    }

                    // Apply date filter
                    if (date && date.trim()) {
                        const filterDate = new Date(date.trim());
                        const nextDay = new Date(filterDate);
                        nextDay.setDate(nextDay.getDate() + 1);

                        query = query
                            .gte('created_at', filterDate.toISOString())
                            .lt('created_at', nextDay.toISOString());
                    }

                    // Apply pagination
                    query = query.range(offset, offset + limit - 1);

                    const { data, count, error } = await query;

                    if (error) {
                        console.error('❌ Error saat ambil data pembayaran:', error);
                        throw Boom.internal('Gagal mengambil payment logs');
                    }

                    return h.response({
                        data: data || [],
                        page,
                        total: count || 0,
                        totalPages: Math.ceil((count || 0) / limit),
                    }).code(200);
                } catch (error) {
                    console.error('Error in GET /admin/payments:', error);
                    if (error.isBoom) throw error;
                    throw Boom.internal('Failed to fetch payments');
                }
            }
        });

        // === GET /admin/payments/statistics - Get payment statistics
        server.route({
            method: 'GET',
            path: '/admin/payments/statistics',
            options: {
                tags: ['api', 'Payment'],
                description: 'Get payment statistics (admin only)',
                pre: [verifyToken, requireRole('admin')],
            },
            handler: async (req, h) => {
                try {
                    // Get all payments for statistics
                    const { data: payments, error } = await db
                        .from('payment_logs')
                        .select('status, amount, created_at');

                    if (error) {
                        console.error('Error fetching payments for statistics:', error);
                        throw error;
                    }

                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    const stats = {
                        totalTransactions: payments?.length || 0,
                        totalRevenue: payments?.filter(p => p.status === 'settlement')
                            .reduce((sum, p) => sum + (p.amount || 0), 0) || 0,
                        successfulPayments: payments?.filter(p => p.status === 'settlement').length || 0,
                        pendingPayments: payments?.filter(p => p.status === 'pending').length || 0,
                        failedPayments: payments?.filter(p => ['failure', 'cancel'].includes(p.status)).length || 0,
                        expiredPayments: payments?.filter(p => p.status === 'expire').length || 0,
                        todayTransactions: payments?.filter(p =>
                            p.created_at && new Date(p.created_at) >= startOfDay
                        ).length || 0,
                        thisMonthTransactions: payments?.filter(p =>
                            p.created_at && new Date(p.created_at) >= startOfMonth
                        ).length || 0,
                        todayRevenue: payments?.filter(p =>
                            p.status === 'settlement' && p.created_at && new Date(p.created_at) >= startOfDay
                        ).reduce((sum, p) => sum + (p.amount || 0), 0) || 0
                    };

                    return h.response(stats).code(200);
                } catch (error) {
                    console.error('Error getting payment statistics:', error);
                    throw Boom.internal('Failed to get payment statistics');
                }
            }
        });

        // === GET /admin/payments/export - Export payments to CSV
        server.route({
            method: 'GET',
            path: '/admin/payments/export',
            options: {
                tags: ['api', 'Payment'],
                description: 'Export payment logs to CSV (admin only)',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    query: Joi.object({
                        search: Joi.string().allow('', null).optional(),
                        status: Joi.string().valid('settlement', 'pending', 'expire', 'cancel', 'failure').allow('', null).optional(),
                        date: Joi.date().iso().allow('', null).optional(),
                        email: Joi.string().email().allow('', null).optional()
                    }),
                },
            },
            handler: async (req, h) => {
                try {
                    const { search, status, date, email } = req.query;

                    let query = db
                        .from('payment_logs')
                        .select('*')
                        .order('created_at', { ascending: false });

                    // Apply same filters as list endpoint
                    if (search && search.trim()) {
                        query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%,order_id.ilike.%${search.trim()}%,product.ilike.%${search.trim()}%`);
                    }

                    if (status && status.trim()) {
                        query = query.eq('status', status.trim());
                    }

                    if (email && email.trim()) {
                        query = query.eq('email', email.trim());
                    }

                    if (date && date.trim()) {
                        const filterDate = new Date(date.trim());
                        const nextDay = new Date(filterDate);
                        nextDay.setDate(nextDay.getDate() + 1);

                        query = query
                            .gte('created_at', filterDate.toISOString())
                            .lt('created_at', nextDay.toISOString());
                    }

                    const { data: payments, error } = await query;

                    if (error) {
                        console.error('Error fetching payments for export:', error);
                        throw error;
                    }

                    // Prepare CSV data
                    const csvData = (payments || []).map(payment => ({
                        'Order ID': payment.order_id || '',
                        'Nama Lengkap': payment.full_name || '',
                        'Email': payment.email || '',
                        'Produk': payment.product || '',
                        'Jumlah': payment.amount || 0,
                        'Status': payment.status || '',
                        'Transaction ID': payment.transaction_id || '',
                        'Payment Type': payment.payment_type || '',
                        'VA Number': payment.va_number || '',
                        'Tanggal Dibuat': payment.created_at ? new Date(payment.created_at).toLocaleDateString('id-ID') : '',
                        'Tanggal Update': payment.updated_at ? new Date(payment.updated_at).toLocaleDateString('id-ID') : '',
                        'Catatan': (payment.notes || '').replace(/"/g, '""') // Escape quotes
                    }));

                    // Convert to CSV
                    const Papa = require('papaparse');
                    const csv = Papa.unparse(csvData);

                    // Return CSV file
                    return h.response(csv)
                        .type('text/csv')
                        .header('Content-Disposition', `attachment; filename=payments-${Date.now()}.csv`);
                } catch (error) {
                    console.error('Error exporting payments:', error);
                    throw Boom.internal('Failed to export payments');
                }
            }
        });

        // === GET /admin/payments/{id} - Get payment detail
        server.route({
            method: 'GET',
            path: '/admin/payments/{id}',
            options: {
                tags: ['api', 'Payment'],
                description: 'Get detail payment log by id (admin only)',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    params: Joi.object({
                        id: Joi.string().uuid().required()
                    })
                }
            },
            handler: async (req, h) => {
                try {
                    const id = req.params.id;

                    const { data, error } = await db
                        .from('payment_logs')
                        .select('*')
                        .eq('id', id)
                        .maybeSingle();

                    if (error) {
                        console.error('Error fetching payment detail:', error);
                        throw error;
                    }

                    if (!data) {
                        throw Boom.notFound('Log pembayaran tidak ditemukan');
                    }

                    return h.response(data).code(200);
                } catch (error) {
                    console.error('Error in GET /admin/payments/{id}:', error);
                    if (error.isBoom) throw error;
                    throw Boom.internal('Failed to fetch payment detail');
                }
            }
        });

        // === DELETE /admin/payments/{id} - Delete payment log
        server.route({
            method: 'DELETE',
            path: '/admin/payments/{id}',
            options: {
                tags: ['api', 'Payment'],
                description: 'Hapus log pembayaran (admin only)',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    params: Joi.object({
                        id: Joi.string().uuid().required()
                    })
                }
            },
            handler: async (req, h) => {
                try {
                    const id = req.params.id;

                    // Check if payment exists
                    const { data: existingPayment, error: checkError } = await db
                        .from('payment_logs')
                        .select('id, full_name, email')
                        .eq('id', id)
                        .maybeSingle();

                    if (checkError) {
                        console.error('Error checking payment:', checkError);
                        throw checkError;
                    }

                    if (!existingPayment) {
                        throw Boom.notFound('Log pembayaran tidak ditemukan');
                    }

                    // Delete payment log
                    const { error } = await db
                        .from('payment_logs')
                        .delete()
                        .eq('id', id);

                    if (error) {
                        console.error('Error deleting payment:', error);
                        throw error;
                    }

                    return h.response({
                        message: 'Log pembayaran berhasil dihapus',
                        deletedPayment: {
                            id: existingPayment.id,
                            full_name: existingPayment.full_name,
                            email: existingPayment.email
                        }
                    }).code(200);
                } catch (error) {
                    console.error('Error in DELETE /admin/payments/{id}:', error);
                    if (error.isBoom) throw error;
                    throw Boom.internal('Failed to delete payment');
                }
            }
        });

        // === PUT /admin/payments/{id}/status - Update payment status (optional)
        server.route({
            method: 'PUT',
            path: '/admin/payments/{id}/status',
            options: {
                tags: ['api', 'Payment'],
                description: 'Update payment status (admin only)',
                pre: [verifyToken, requireRole('admin')],
                validate: {
                    params: Joi.object({
                        id: Joi.string().uuid().required()
                    }),
                    payload: Joi.object({
                        status: Joi.string().valid('settlement', 'pending', 'expire', 'cancel', 'failure').required(),
                        notes: Joi.string().allow('', null).optional()
                    })
                }
            },
            handler: async (req, h) => {
                try {
                    const id = req.params.id;
                    const { status, notes } = req.payload;

                    // Check if payment exists
                    const { data: existingPayment, error: checkError } = await db
                        .from('payment_logs')
                        .select('id')
                        .eq('id', id)
                        .maybeSingle();

                    if (checkError) {
                        console.error('Error checking payment:', checkError);
                        throw checkError;
                    }

                    if (!existingPayment) {
                        throw Boom.notFound('Log pembayaran tidak ditemukan');
                    }

                    // Update payment status
                    const updateData = {
                        status,
                        updated_at: new Date().toISOString()
                    };

                    if (notes !== undefined) {
                        updateData.notes = notes;
                    }

                    const { error } = await db
                        .from('payment_logs')
                        .update(updateData)
                        .eq('id', id);

                    if (error) {
                        console.error('Error updating payment status:', error);
                        throw error;
                    }

                    return h.response({
                        message: 'Status pembayaran berhasil diupdate',
                        status: status
                    }).code(200);
                } catch (error) {
                    console.error('Error in PUT /admin/payments/{id}/status:', error);
                    if (error.isBoom) throw error;
                    throw Boom.internal('Failed to update payment status');
                }
            }
        });
    }
};