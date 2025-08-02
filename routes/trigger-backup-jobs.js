// routes/trigger-backup-jobs.js
const { runDailyBackup, runWeeklyCleanup } = require('../worker/log-backup-worker');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'trigger-backup-jobs',
    version: '1.0.0',
    register: async function (server) {
        server.route([
            // === POST /trigger-backup - Manual trigger daily backup
            {
                method: 'POST',
                path: '/trigger-backup',
                options: {
                    tags: ['api', 'Admin', 'Worker'],
                    description: 'Manual trigger backup harian',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async (request, h) => {
                    try {
                        console.log('🔧 [MANUAL_TRIGGER] Daily backup triggered by admin:', request.auth.credentials.full_name);

                        const result = await runDailyBackup();

                        if (result.skipped) {
                            return h.response({
                                message: 'Backup dilewati',
                                reason: result.reason
                            }).code(200);
                        }

                        return h.response({
                            message: 'Backup harian berhasil diproses',
                            result: {
                                filename: result.filename,
                                logCount: result.logCount,
                                deletedCount: result.deletedCount,
                                emailsSent: result.emailsSent
                            }
                        }).code(200);

                    } catch (error) {
                        console.error('❌ [MANUAL_TRIGGER] Daily backup error:', error);
                        return h.response({
                            error: 'Backup gagal',
                            message: error.message
                        }).code(500);
                    }
                },
            },

            // === POST /trigger-cleanup - Manual trigger weekly cleanup
            {
                method: 'POST',
                path: '/trigger-cleanup',
                options: {
                    tags: ['api', 'Admin', 'Worker'],
                    description: 'Manual trigger cleanup mingguan',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async (request, h) => {
                    try {
                        console.log('🔧 [MANUAL_TRIGGER] Weekly cleanup triggered by admin:', request.auth.credentials.full_name);

                        const result = await runWeeklyCleanup();

                        if (result.skipped) {
                            return h.response({
                                message: 'Cleanup dilewati',
                                reason: result.reason
                            }).code(200);
                        }

                        return h.response({
                            message: 'Cleanup mingguan berhasil diproses',
                            result: {
                                deletedCount: result.deletedCount,
                                retentionDays: result.retentionDays,
                                notificationsSent: result.notificationsSent
                            }
                        }).code(200);

                    } catch (error) {
                        console.error('❌ [MANUAL_TRIGGER] Weekly cleanup error:', error);
                        return h.response({
                            error: 'Cleanup gagal',
                            message: error.message
                        }).code(500);
                    }
                },
            },

            // === GET /backup-status - Check backup worker status
            {
                method: 'GET',
                path: '/backup-status',
                options: {
                    tags: ['api', 'Admin', 'Worker'],
                    description: 'Check status backup worker',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async (request, h) => {
                    try {
                        const { logBackupWorker } = require('../worker/log-backup-worker');
                        const status = logBackupWorker.getStatus();

                        // Get recent backup activities
                        const db = require('../db');
                        const { data: recentBackups } = await db
                            .from('activity_logs')
                            .select('action, detail, created_at')
                            .in('action', ['AUTO_BACKUP', 'BACKUP_DOWNLOAD', 'BACKUP_AND_CLEANUP', 'AUTO_CLEANUP'])
                            .order('created_at', { ascending: false })
                            .limit(5);

                        // Get today's log count
                        const today = new Date().toISOString().slice(0, 10);
                        const { count: todayLogCount } = await db
                            .from('activity_logs')
                            .select('id', { count: 'exact' })
                            .gte('created_at', `${today}T00:00:00.000Z`)
                            .lte('created_at', `${today}T23:59:59.999Z`);

                        return {
                            worker_status: status,
                            recent_backups: recentBackups || [],
                            today_log_count: todayLogCount || 0,
                            timestamp: new Date().toISOString()
                        };

                    } catch (error) {
                        console.error('❌ [STATUS_CHECK] Error getting backup status:', error);
                        return h.response({
                            error: 'Gagal mengambil status backup',
                            message: error.message
                        }).code(500);
                    }
                },
            }
        ]);
    },
};