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
                description: 'Lihat log aktivitas sistem',
                pre: [verifyToken, requireRole('admin')],
            },
            handler: async (req, h) => {
                const { date } = req.query;

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
                    console.error('Error mengambil log:', error.message);
                    return h.response({ error: 'Gagal mengambil log' }).code(500);
                }

                const logs = data.map(log => ({
                    id: log.id,
                    user_fullname: log.users?.full_name || null,
                    role: log.role,
                    action: log.action,
                    detail: log.detail,
                    created_at: log.created_at,
                }));

                return { logs };
            },
        });
    },
};
