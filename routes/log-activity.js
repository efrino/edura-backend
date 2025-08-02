// // === Solusi 1: Tanpa Joi Validation (Paling Sederhana) ===
// const { verifyToken, requireRole } = require('../utils/middleware');
// const db = require('../db');

// module.exports = {
//     name: 'activity-log-endpoint',
//     register: async function (server) {
//         server.route({
//             method: 'GET',
//             path: '/admin/activity-logs',
//             options: {
//                 tags: ['api', 'Admin'],
//                 description: 'Mengambil log aktivitas sistem berdasarkan tanggal',
//                 pre: [verifyToken, requireRole('admin')],
//             },
//             handler: async (request, h) => {
//                 try {
//                     const { date } = request.query;

//                     // Manual validation
//                     if (!date) {
//                         return h.response({ 
//                             error: 'Parameter date wajib diisi' 
//                         }).code(400);
//                     }

//                     // Validate date format
//                     const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
//                     if (!dateRegex.test(date)) {
//                         return h.response({ 
//                             error: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD' 
//                         }).code(400);
//                     }

//                     // Additional date validation
//                     const parsedDate = new Date(date);
//                     if (isNaN(parsedDate.getTime())) {
//                         return h.response({ 
//                             error: 'Tanggal tidak valid' 
//                         }).code(400);
//                     }

//                     // Query database
//                     const { data, error } = await db
//                         .from('activity_logs')
//                         .select(`
//                             id,
//                             user_id,
//                             role,
//                             action,
//                             detail,
//                             created_at,
//                             users!fk_user_id ( full_name )
//                         `)
//                         .gte('created_at', `${date}T00:00:00.000Z`)
//                         .lte('created_at', `${date}T23:59:59.999Z`)
//                         .order('created_at', { ascending: false });

//                     if (error) {
//                         console.error('Database error:', error);
//                         return h.response({ 
//                             error: 'Gagal mengambil data log dari database' 
//                         }).code(500);
//                     }

//                     // Transform data
//                     const logs = data.map(log => ({
//                         id: log.id,
//                         user_fullname: log.users?.full_name || null,
//                         role: log.role,
//                         action: log.action,
//                         detail: log.detail,
//                         created_at: log.created_at,
//                     }));

//                     return h.response({ 
//                         logs,
//                         count: logs.length,
//                         date: date
//                     }).code(200);

//                 } catch (error) {
//                     console.error('Unexpected error in activity logs endpoint:', error);
//                     return h.response({ 
//                         error: 'Terjadi kesalahan internal server' 
//                     }).code(500);
//                 }
//             },
//         });
//     },
// };
// routes/admin-log-backup.js - FIXED VERSION
const Joi = require('joi');
const Boom = require('@hapi/boom');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'admin-log-backup',
    version: '1.0.0',
    register: async function (server) {
        server.route([
            // === GET /admin/activity-logs - Enhanced with pagination
            {
                method: 'GET',
                path: '/admin/activity-logs',
                options: {
                    tags: ['api', 'Admin', 'Backup'],
                    description: 'Mengambil log aktivitas sistem berdasarkan tanggal',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        query: Joi.object({
                            date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
                            limit: Joi.number().min(1).max(1000).default(100),
                            page: Joi.number().min(1).default(1)
                        })
                    }
                },
                handler: async (request, h) => {
                    try {
                        const { date, limit, page } = request.query;
                        const offset = (page - 1) * limit;

                        // FIXED: Query dengan join ke users untuk mendapatkan full_name
                        const { data, error, count } = await db
                            .from('activity_logs')
                            .select(`
                                id,
                                user_id,
                                role,
                                action,
                                detail,
                                created_at,
                                users (full_name)
                            `, { count: 'exact' })
                            .gte('created_at', `${date}T00:00:00.000Z`)
                            .lte('created_at', `${date}T23:59:59.999Z`)
                            .order('created_at', { ascending: false })
                            .range(offset, offset + limit - 1);

                        if (error) {
                            console.error('Database error:', error);
                            throw Boom.internal('Gagal mengambil data log dari database');
                        }

                        // Transform data
                        const logs = (data || []).map(log => ({
                            id: log.id,
                            user_fullname: log.users?.full_name || null,
                            role: log.role,
                            action: log.action,
                            detail: log.detail,
                            created_at: log.created_at,
                        }));

                        return {
                            logs,
                            count: count || 0,
                            date: date,
                            page,
                            totalPages: Math.ceil((count || 0) / limit)
                        };

                    } catch (error) {
                        console.error('Error in activity logs endpoint:', error);
                        if (error.isBoom) throw error;
                        throw Boom.internal('Terjadi kesalahan internal server');
                    }
                }
            },

            // === GET /admin/activity-logs/backup/{date} - Download backup file
            {
                method: 'GET',
                path: '/admin/activity-logs/backup/{date}',
                options: {
                    tags: ['api', 'Admin', 'Backup'],
                    description: 'Download log backup untuk tanggal tertentu',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
                        }),
                        query: Joi.object({
                            format: Joi.string().valid('json', 'txt').default('json'),
                            cleanup: Joi.boolean().default(false)
                        })
                    }
                },
                handler: async (request, h) => {
                    try {
                        const { date } = request.params;
                        const { format, cleanup } = request.query;

                        // Get all logs for the date
                        const { data: logs, error } = await db
                            .from('activity_logs')
                            .select(`
                                id,
                                user_id,
                                role,
                                action,
                                detail,
                                created_at,
                                users (full_name)
                            `)
                            .gte('created_at', `${date}T00:00:00.000Z`)
                            .lte('created_at', `${date}T23:59:59.999Z`)
                            .order('created_at', { ascending: false });

                        if (error) {
                            console.error('Database error:', error);
                            throw Boom.internal('Gagal mengambil data log dari database');
                        }

                        if (!logs || logs.length === 0) {
                            throw Boom.notFound(`Tidak ada log untuk tanggal ${date}`);
                        }

                        // Transform data
                        const transformedLogs = logs.map(log => ({
                            id: log.id,
                            user_fullname: log.users?.full_name || null,
                            user_id: log.user_id,
                            role: log.role,
                            action: log.action,
                            detail: log.detail,
                            created_at: log.created_at,
                        }));

                        // Generate backup content
                        let backupContent = '';
                        let contentType = '';
                        let fileExtension = '';

                        if (format === 'json') {
                            backupContent = JSON.stringify({
                                backup_date: new Date().toISOString(),
                                log_date: date,
                                total_logs: transformedLogs.length,
                                logs: transformedLogs
                            }, null, 2);
                            contentType = 'application/json';
                            fileExtension = 'json';
                        } else {
                            // Text format
                            const header = `=== EDURA PLATFORM LOG BACKUP ===\n`;
                            const info = `Backup Date: ${new Date().toISOString()}\n`;
                            const logDate = `Log Date: ${date}\n`;
                            const total = `Total Logs: ${transformedLogs.length}\n`;
                            const separator = `${'='.repeat(80)}\n\n`;

                            const logEntries = transformedLogs.map(log => {
                                return [
                                    `[${log.created_at}] ${log.action}`,
                                    `User: ${log.user_fullname || 'System'} (${log.role || 'Unknown'})`,
                                    `Detail: ${typeof log.detail === 'object' ? JSON.stringify(log.detail) : log.detail}`,
                                    '-'.repeat(60)
                                ].join('\n');
                            }).join('\n\n');

                            backupContent = header + info + logDate + total + separator + logEntries;
                            contentType = 'text/plain';
                            fileExtension = 'log';
                        }

                        // FIXED: Generate filename with better version detection
                        const versionNumber = await getNextVersionNumberFixed(date);
                        const filename = `${date.replace(/-/g, '')}-${versionNumber.toString().padStart(2, '0')}.${fileExtension}`;

                        // FIXED: Cleanup logs if requested (with batch processing)
                        if (cleanup) {
                            const logIds = logs.map(log => log.id);
                            await cleanupLogsBatch(logIds, date);

                            // Log the cleanup action
                            await logBackupAction(request.auth.credentials.id, 'BACKUP_AND_CLEANUP', {
                                date: date,
                                logs_count: logs.length,
                                filename: filename
                            });
                        } else {
                            // Log the backup action only
                            await logBackupAction(request.auth.credentials.id, 'BACKUP_DOWNLOAD', {
                                date: date,
                                logs_count: logs.length,
                                filename: filename
                            });
                        }

                        // Return file
                        return h.response(backupContent)
                            .type(contentType)
                            .header('Content-Disposition', `attachment; filename="${filename}"`)
                            .header('X-Log-Count', transformedLogs.length)
                            .header('X-Backup-Date', date);

                    } catch (error) {
                        console.error('Error in backup endpoint:', error);
                        if (error.isBoom) throw error;
                        throw Boom.internal('Gagal membuat backup log');
                    }
                }
            },

            // === POST /admin/activity-logs/cleanup - Clean up logs after confirmation
            {
                method: 'POST',
                path: '/admin/activity-logs/cleanup',
                options: {
                    tags: ['api', 'Admin', 'Backup'],
                    description: 'Hapus log setelah backup (dengan konfirmasi)',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        payload: Joi.object({
                            date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
                            confirm: Joi.boolean().valid(true).required(),
                            backup_filename: Joi.string().optional()
                        })
                    }
                },
                handler: async (request, h) => {
                    try {
                        const { date, confirm, backup_filename } = request.payload;

                        if (!confirm) {
                            throw Boom.badRequest('Konfirmasi diperlukan untuk menghapus log');
                        }

                        // Get log IDs for the date
                        const { data: logs, error: fetchError } = await db
                            .from('activity_logs')
                            .select('id')
                            .gte('created_at', `${date}T00:00:00.000Z`)
                            .lte('created_at', `${date}T23:59:59.999Z`);

                        if (fetchError) {
                            console.error('Error fetching logs for cleanup:', fetchError);
                            throw Boom.internal('Gagal mengambil data log');
                        }

                        if (!logs || logs.length === 0) {
                            throw Boom.notFound(`Tidak ada log untuk tanggal ${date}`);
                        }

                        const logIds = logs.map(log => log.id);
                        const deletedCount = await cleanupLogsBatch(logIds, date);

                        // Log the cleanup action
                        await logBackupAction(request.auth.credentials.id, 'LOG_CLEANUP', {
                            date: date,
                            logs_deleted: deletedCount,
                            backup_filename: backup_filename || 'manual_cleanup'
                        });

                        return {
                            message: 'Log berhasil dihapus',
                            deleted_count: deletedCount,
                            date: date
                        };

                    } catch (error) {
                        console.error('Error in cleanup endpoint:', error);
                        if (error.isBoom) throw error;
                        throw Boom.internal('Gagal menghapus log');
                    }
                }
            },

            // === GET /admin/activity-logs/backup-history - Get backup history
            {
                method: 'GET',
                path: '/admin/activity-logs/backup-history',
                options: {
                    tags: ['api', 'Admin', 'Backup'],
                    description: 'Riwayat backup log',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        query: Joi.object({
                            limit: Joi.number().min(1).max(100).default(20),
                            page: Joi.number().min(1).default(1)
                        })
                    }
                },
                handler: async (request, h) => {
                    try {
                        const { limit, page } = request.query;
                        const offset = (page - 1) * limit;

                        const { data, error, count } = await db
                            .from('activity_logs')
                            .select(`
                                id,
                                action,
                                detail,
                                created_at,
                                users (full_name)
                            `, { count: 'exact' })
                            .in('action', ['BACKUP_DOWNLOAD', 'BACKUP_AND_CLEANUP', 'LOG_CLEANUP', 'AUTO_BACKUP'])
                            .order('created_at', { ascending: false })
                            .range(offset, offset + limit - 1);

                        if (error) {
                            console.error('Error fetching backup history:', error);
                            throw Boom.internal('Gagal mengambil riwayat backup');
                        }

                        const history = (data || []).map(entry => ({
                            id: entry.id,
                            action: entry.action,
                            detail: entry.detail,
                            admin_name: entry.users?.full_name || 'System',
                            created_at: entry.created_at
                        }));

                        return {
                            history,
                            count: count || 0,
                            page,
                            totalPages: Math.ceil((count || 0) / limit)
                        };

                    } catch (error) {
                        console.error('Error in backup history endpoint:', error);
                        if (error.isBoom) throw error;
                        throw Boom.internal('Gagal mengambil riwayat backup');
                    }
                }
            }
        ]);
    }
};

// === FIXED Helper Functions ===

// FIXED: Version number detection with proper JSONB casting
async function getNextVersionNumberFixed(date) {
    try {
        // Use text casting instead of LIKE operator on JSONB
        const { data, error } = await db
            .from('activity_logs')
            .select('detail')
            .in('action', ['BACKUP_DOWNLOAD', 'BACKUP_AND_CLEANUP', 'AUTO_BACKUP'])
            .not('detail', 'is', null);

        if (error) {
            console.warn('Error checking version number:', error);
            return 1;
        }

        if (!data || data.length === 0) {
            return 1;
        }

        // Filter in JavaScript instead of database LIKE operation
        const targetPrefix = date.replace(/-/g, '');
        let maxVersion = 0;

        data.forEach(entry => {
            if (entry.detail && entry.detail.filename && typeof entry.detail.filename === 'string') {
                if (entry.detail.filename.startsWith(targetPrefix)) {
                    const match = entry.detail.filename.match(/-(\d+)\./);
                    if (match) {
                        const version = parseInt(match[1], 10);
                        if (version > maxVersion) {
                            maxVersion = version;
                        }
                    }
                }
            }
        });

        return maxVersion + 1;
    } catch (error) {
        console.warn('Error in getNextVersionNumberFixed:', error);
        return 1;
    }
}

// FIXED: Batch cleanup to avoid 414 Request-URI Too Large
async function cleanupLogsBatch(logIds, date) {
    try {
        if (!logIds || logIds.length === 0) {
            return 0;
        }

        console.log(`🧹 Starting batch cleanup for ${logIds.length} logs on ${date}`);

        // Process in smaller batches to avoid 414 error
        const batchSize = 100; // Process 100 IDs at a time
        let totalDeleted = 0;

        for (let i = 0; i < logIds.length; i += batchSize) {
            const batch = logIds.slice(i, i + batchSize);

            try {
                const { error, count } = await db
                    .from('activity_logs')
                    .delete({ count: 'exact' })
                    .in('id', batch);

                if (error) {
                    console.error(`Error deleting batch ${i / batchSize + 1}:`, error);
                    throw error;
                }

                const batchDeleted = count || 0;
                totalDeleted += batchDeleted;

                console.log(`✅ Batch ${i / batchSize + 1}: Deleted ${batchDeleted} logs`);

                // Small delay between batches to avoid overwhelming the database
                if (i + batchSize < logIds.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (batchError) {
                console.error(`❌ Error in batch ${i / batchSize + 1}:`, batchError);
                throw batchError;
            }
        }

        console.log(`✅ Batch cleanup completed: ${totalDeleted} total logs deleted for date ${date}`);
        return totalDeleted;

    } catch (error) {
        console.error('Error in cleanupLogsBatch:', error);
        throw new Error(`Gagal menghapus log dari database: ${error.message}`);
    }
}

async function logBackupAction(userId, action, detail) {
    try {
        const { error } = await db
            .from('activity_logs')
            .insert({
                user_id: userId,
                role: 'admin',
                action: action,
                detail: detail,
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('Error logging backup action:', error);
        }
    } catch (error) {
        console.error('Error in logBackupAction:', error);
    }
}