// worker/log-backup-worker.js - FIXED VERSION
const db = require('../db');
const { getEnv } = require('../utils/env');
const { sendLogBackupEmail, sendBackupErrorEmail, sendCleanupNotificationEmail } = require('../utils/email');

class LogBackupWorker {
    constructor() {
        this.isRunning = false;
    }

    // === Main Backup Functions ===

    async performDailyBackup() {
        try {
            console.log('📦 [BACKUP_WORKER] Starting daily log backup...');

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const backupDate = yesterday.toISOString().slice(0, 10);

            // Check if backup is enabled
            const backupEnabled = await this.getEnvValue('BACKUP_ENABLED');
            if (backupEnabled !== 'true') {
                console.log('⚠️ [BACKUP_WORKER] Backup disabled, skipping...');
                return { skipped: true, reason: 'Backup disabled' };
            }

            // Get admin emails for notification
            const adminEmails = await this.getAdminEmails();
            if (adminEmails.length === 0) {
                console.warn('⚠️ [BACKUP_WORKER] No admin emails found for backup notification');
                return { skipped: true, reason: 'No admin emails configured' };
            }

            // Get logs for backup date
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
                .gte('created_at', `${backupDate}T00:00:00.000Z`)
                .lte('created_at', `${backupDate}T23:59:59.999Z`)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ [BACKUP_WORKER] Error fetching logs for backup:', error);
                throw new Error('Failed to fetch logs for backup');
            }

            if (!logs || logs.length === 0) {
                console.log(`ℹ️ [BACKUP_WORKER] No logs found for ${backupDate}, skipping backup`);
                return { skipped: true, reason: 'No logs found' };
            }

            // Transform logs
            const transformedLogs = logs.map(log => ({
                id: log.id,
                user_fullname: log.users?.full_name || null,
                user_id: log.user_id,
                role: log.role,
                action: log.action,
                detail: log.detail,
                created_at: log.created_at,
            }));

            // Generate backup content (JSON format)
            const backupContent = JSON.stringify({
                backup_date: new Date().toISOString(),
                log_date: backupDate,
                total_logs: transformedLogs.length,
                backup_type: 'automated_daily',
                logs: transformedLogs
            }, null, 2);

            // FIXED: Generate filename with improved version detection
            const versionNumber = await this.getNextVersionNumberFixed(backupDate);
            const filename = `${backupDate.replace(/-/g, '')}-${versionNumber.toString().padStart(2, '0')}.json`;

            // Create buffer for email attachment
            const backupBuffer = Buffer.from(backupContent, 'utf8');

            // Send backup email to all admins
            const emailPromises = adminEmails.map(async (adminEmail) => {
                try {
                    await sendLogBackupEmail(adminEmail.email, {
                        filename,
                        backupDate,
                        logCount: transformedLogs.length,
                        adminName: adminEmail.full_name,
                        backupType: 'daily'
                    }, backupBuffer);
                    return { email: adminEmail.email, success: true };
                } catch (emailError) {
                    console.error(`❌ [BACKUP_WORKER] Failed to send backup email to ${adminEmail.email}:`, emailError);
                    return { email: adminEmail.email, success: false, error: emailError.message };
                }
            });

            const emailResults = await Promise.all(emailPromises);
            const successfulEmails = emailResults.filter(result => result.success).length;

            // FIXED: Clean up logs after successful backup using batch processing
            const logIds = logs.map(log => log.id);
            const deletedCount = await this.cleanupLogsBatch(logIds);

            // Log the automated backup action
            await this.logBackupAction('AUTO_BACKUP', {
                date: backupDate,
                logs_count: transformedLogs.length,
                logs_deleted: deletedCount,
                filename: filename,
                admin_emails_sent: successfulEmails,
                email_failures: emailResults.length - successfulEmails
            });

            console.log(`✅ [BACKUP_WORKER] Daily backup completed: ${filename} (${transformedLogs.length} logs, sent to ${successfulEmails}/${adminEmails.length} admins)`);

            return {
                success: true,
                filename,
                logCount: transformedLogs.length,
                deletedCount,
                emailsSent: successfulEmails,
                emailResults
            };

        } catch (error) {
            console.error('❌ [BACKUP_WORKER] Error in daily backup:', error);

            // Log error
            await this.logBackupAction('AUTO_BACKUP_ERROR', {
                error: error.message,
                timestamp: new Date().toISOString()
            });

            // Notify admins about backup error
            await this.notifyBackupError(error);

            throw error;
        }
    }

    async performWeeklyCleanup() {
        try {
            console.log('🧹 [BACKUP_WORKER] Starting weekly log cleanup...');

            const retentionDays = parseInt(await this.getEnvValue('OLD_LOG_RETENTION_DAYS', '30'));
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffDateISO = cutoffDate.toISOString();

            // Get count of logs to be deleted
            const { count, error: countError } = await db
                .from('activity_logs')
                .select('id', { count: 'exact' })
                .lt('created_at', cutoffDateISO);

            if (countError) {
                console.error('❌ [BACKUP_WORKER] Error counting old logs:', countError);
                throw new Error('Failed to count old logs');
            }

            if (!count || count === 0) {
                console.log('ℹ️ [BACKUP_WORKER] No old logs to cleanup');
                return { skipped: true, reason: 'No old logs found' };
            }

            // FIXED: Delete old logs using date range instead of IDs to avoid 414 error
            const { error: deleteError, count: actualDeleted } = await db
                .from('activity_logs')
                .delete({ count: 'exact' })
                .lt('created_at', cutoffDateISO);

            if (deleteError) {
                console.error('❌ [BACKUP_WORKER] Error deleting old logs:', deleteError);
                throw new Error('Failed to delete old logs');
            }

            // Log the cleanup action
            await this.logBackupAction('AUTO_CLEANUP', {
                cutoff_date: cutoffDateISO,
                logs_deleted: actualDeleted || count,
                cleanup_type: 'weekly_old_logs',
                retention_days: retentionDays
            });

            console.log(`✅ [BACKUP_WORKER] Weekly cleanup completed: ${actualDeleted || count} old logs deleted (older than ${retentionDays} days)`);

            // Notify admins about cleanup
            const adminEmails = await this.getAdminEmails();
            const cleanupPromises = adminEmails.map(async (adminEmail) => {
                try {
                    await sendCleanupNotificationEmail(adminEmail.email, {
                        adminName: adminEmail.full_name,
                        deletedCount: actualDeleted || count,
                        cutoffDate: cutoffDateISO,
                        retentionDays
                    });
                    return { email: adminEmail.email, success: true };
                } catch (emailError) {
                    console.error(`❌ [BACKUP_WORKER] Failed to send cleanup notification to ${adminEmail.email}:`, emailError);
                    return { email: adminEmail.email, success: false, error: emailError.message };
                }
            });

            const notificationResults = await Promise.all(cleanupPromises);
            const successfulNotifications = notificationResults.filter(result => result.success).length;

            return {
                success: true,
                deletedCount: actualDeleted || count,
                retentionDays,
                cutoffDate: cutoffDateISO,
                notificationsSent: successfulNotifications,
                notificationResults
            };

        } catch (error) {
            console.error('❌ [BACKUP_WORKER] Error in weekly cleanup:', error);

            await this.logBackupAction('AUTO_CLEANUP_ERROR', {
                error: error.message,
                timestamp: new Date().toISOString()
            });

            throw error;
        }
    }

    // === Helper Methods ===

    async getAdminEmails() {
        try {
            const { data, error } = await db
                .from('users')
                .select('email, full_name')
                .eq('role', 'admin')
                .eq('is_verified', true);

            if (error) {
                console.error('Error fetching admin emails:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in getAdminEmails:', error);
            return [];
        }
    }

    async getEnvValue(key, defaultValue = null) {
        try {
            const value = await getEnv(key);
            return value.replace(/^"(.*)"$/, '$1'); // Remove quotes if present
        } catch (error) {
            console.warn(`Environment variable ${key} not found, using default:`, defaultValue);
            return defaultValue;
        }
    }

    // FIXED: Version number detection with proper JSONB handling
    async getNextVersionNumberFixed(date) {
        try {
            // Use select all and filter in JavaScript to avoid JSONB LIKE issues
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
    async cleanupLogsBatch(logIds) {
        try {
            if (!logIds || logIds.length === 0) {
                return 0;
            }

            console.log(`🧹 [BACKUP_WORKER] Starting batch cleanup for ${logIds.length} logs`);

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

                    console.log(`✅ [BACKUP_WORKER] Batch ${i / batchSize + 1}: Deleted ${batchDeleted} logs`);

                    // Small delay between batches to avoid overwhelming the database
                    if (i + batchSize < logIds.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                } catch (batchError) {
                    console.error(`❌ [BACKUP_WORKER] Error in batch ${i / batchSize + 1}:`, batchError);
                    throw batchError;
                }
            }

            console.log(`✅ [BACKUP_WORKER] Batch cleanup completed: ${totalDeleted} total logs deleted`);
            return totalDeleted;

        } catch (error) {
            console.error('Error in cleanupLogsBatch:', error);
            throw new Error(`Failed to delete logs from database: ${error.message}`);
        }
    }

    async logBackupAction(action, detail) {
        try {
            const { error } = await db
                .from('activity_logs')
                .insert({
                    user_id: null, // System action
                    role: 'system',
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

    async notifyBackupError(error) {
        try {
            const adminEmails = await this.getAdminEmails();

            for (const adminEmail of adminEmails) {
                try {
                    await sendBackupErrorEmail(adminEmail.email, error);
                } catch (emailError) {
                    console.error(`Failed to send error notification to ${adminEmail.email}:`, emailError);
                }
            }
        } catch (err) {
            console.error('Error notifying backup error:', err);
        }
    }

    // === Public Interface Methods ===

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun || null,
            nextRun: this.nextRun || null
        };
    }

    async triggerDailyBackup() {
        this.isRunning = true;
        this.lastRun = new Date().toISOString();

        try {
            const result = await this.performDailyBackup();
            return result;
        } finally {
            this.isRunning = false;
        }
    }

    async triggerWeeklyCleanup() {
        this.isRunning = true;
        this.lastRun = new Date().toISOString();

        try {
            const result = await this.performWeeklyCleanup();
            return result;
        } finally {
            this.isRunning = false;
        }
    }
}

// === Export Functions ===

// Singleton instance
const logBackupWorker = new LogBackupWorker();

// Export as functions for compatibility with your existing worker system
async function runDailyBackup() {
    console.log(`[${new Date().toISOString()}] Starting daily backup worker...`);

    try {
        const result = await logBackupWorker.triggerDailyBackup();
        console.log(`[${new Date().toISOString()}] Daily backup worker completed successfully`);
        return result;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Daily backup worker failed:`, error);
        throw error;
    }
}

async function runWeeklyCleanup() {
    console.log(`[${new Date().toISOString()}] Starting weekly cleanup worker...`);

    try {
        const result = await logBackupWorker.triggerWeeklyCleanup();
        console.log(`[${new Date().toISOString()}] Weekly cleanup worker completed successfully`);
        return result;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Weekly cleanup worker failed:`, error);
        throw error;
    }
}

// Export both class and functions
module.exports = {
    LogBackupWorker,
    logBackupWorker,
    runDailyBackup,
    runWeeklyCleanup
};