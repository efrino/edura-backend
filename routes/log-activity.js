// === Solusi 1: Tanpa Joi Validation (Paling Sederhana) ===
const { verifyToken, requireRole } = require('../utils/middleware');
const db = require('../db');

module.exports = {
    name: 'activity-log-endpoint',
    register: async function (server) {
        server.route({
            method: 'GET',
            path: '/admin/activity-logs',
            options: {
                tags: ['api', 'Admin'],
                description: 'Mengambil log aktivitas sistem berdasarkan tanggal',
                pre: [verifyToken, requireRole('admin')],
            },
            handler: async (request, h) => {
                try {
                    const { date } = request.query;

                    // Manual validation
                    if (!date) {
                        return h.response({ 
                            error: 'Parameter date wajib diisi' 
                        }).code(400);
                    }

                    // Validate date format
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(date)) {
                        return h.response({ 
                            error: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD' 
                        }).code(400);
                    }

                    // Additional date validation
                    const parsedDate = new Date(date);
                    if (isNaN(parsedDate.getTime())) {
                        return h.response({ 
                            error: 'Tanggal tidak valid' 
                        }).code(400);
                    }

                    // Query database
                    const { data, error } = await db
                        .from('activity_logs')
                        .select(`
                            id,
                            user_id,
                            role,
                            action,
                            detail,
                            created_at,
                            users!fk_user_id ( full_name )
                        `)
                        .gte('created_at', `${date}T00:00:00.000Z`)
                        .lte('created_at', `${date}T23:59:59.999Z`)
                        .order('created_at', { ascending: false });

                    if (error) {
                        console.error('Database error:', error);
                        return h.response({ 
                            error: 'Gagal mengambil data log dari database' 
                        }).code(500);
                    }

                    // Transform data
                    const logs = data.map(log => ({
                        id: log.id,
                        user_fullname: log.users?.full_name || null,
                        role: log.role,
                        action: log.action,
                        detail: log.detail,
                        created_at: log.created_at,
                    }));

                    return h.response({ 
                        logs,
                        count: logs.length,
                        date: date
                    }).code(200);

                } catch (error) {
                    console.error('Unexpected error in activity logs endpoint:', error);
                    return h.response({ 
                        error: 'Terjadi kesalahan internal server' 
                    }).code(500);
                }
            },
        });
    },
};