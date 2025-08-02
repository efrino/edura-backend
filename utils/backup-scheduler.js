// utils/backup-scheduler.js
const cron = require('node-cron');
const { runDailyBackup, runWeeklyCleanup } = require('../worker/log-backup-worker');
const { getEnv } = require('./env');

class BackupScheduler {
    constructor() {
        this.isRunning = false;
        this.jobs = new Map();
        this.scheduledTimes = {};
    }

    async start() {
        if (this.isRunning) {
            console.log('⚠️ [BACKUP_SCHEDULER] Already running');
            return;
        }

        try {
            console.log('🚀 [BACKUP_SCHEDULER] Starting backup scheduler...');

            // Check if backup is enabled
            const backupEnabled = await this.getEnvValue('BACKUP_ENABLED', 'true');
            if (backupEnabled !== 'true') {
                console.log('⚠️ [BACKUP_SCHEDULER] Backup disabled, scheduler not started');
                return;
            }

            // Get backup times from environment
            const backupTime = await this.getEnvValue('BACKUP_TIME', '02:00');
            const cleanupTime = await this.getEnvValue('CLEANUP_TIME', '03:00');

            // Parse time format (HH:MM)
            const backupCron = this.parseTimeToCron(backupTime);
            const cleanupCron = this.parseTimeToCron(cleanupTime, true); // weekly

            this.scheduledTimes = {
                dailyBackup: backupTime,
                weeklyCleanup: cleanupTime
            };

            // Create daily backup job
            this.jobs.set('daily-backup', cron.schedule(backupCron, async () => {
                await this.runDailyBackupJob();
            }, {
                scheduled: false,
                timezone: 'Asia/Jakarta'
            }));

            // Create weekly cleanup job (every Sunday)
            this.jobs.set('weekly-cleanup', cron.schedule(cleanupCron, async () => {
                await this.runWeeklyCleanupJob();
            }, {
                scheduled: false,
                timezone: 'Asia/Jakarta'
            }));

            // Start all jobs
            this.jobs.forEach((job, name) => {
                job.start();
                console.log(`✅ [BACKUP_SCHEDULER] Started job: ${name}`);
            });

            this.isRunning = true;

            console.log('✅ [BACKUP_SCHEDULER] Backup scheduler started successfully');
            console.log(`📅 Daily backup: Every day at ${backupTime} WIB`);
            console.log(`🧹 Weekly cleanup: Every Sunday at ${cleanupTime} WIB`);

        } catch (error) {
            console.error('❌ [BACKUP_SCHEDULER] Failed to start scheduler:', error);
            throw error;
        }
    }

    stop() {
        if (!this.isRunning) {
            console.log('⚠️ [BACKUP_SCHEDULER] Already stopped');
            return;
        }

        console.log('🛑 [BACKUP_SCHEDULER] Stopping backup scheduler...');

        this.jobs.forEach((job, name) => {
            job.destroy();
            console.log(`✅ [BACKUP_SCHEDULER] Stopped job: ${name}`);
        });

        this.jobs.clear();
        this.isRunning = false;

        console.log('✅ [BACKUP_SCHEDULER] Backup scheduler stopped');
    }

    async restart() {
        console.log('🔄 [BACKUP_SCHEDULER] Restarting backup scheduler...');
        this.stop();
        await this.start();
    }

    // === Job Runners ===

    async runDailyBackupJob() {
        try {
            console.log(`🕐 [SCHEDULED_BACKUP] Daily backup started at ${new Date().toLocaleString('id-ID')}`);

            const result = await runDailyBackup();

            if (result.skipped) {
                console.log(`ℹ️ [SCHEDULED_BACKUP] Daily backup skipped: ${result.reason}`);
            } else {
                console.log(`✅ [SCHEDULED_BACKUP] Daily backup completed successfully`);
            }

        } catch (error) {
            console.error('❌ [SCHEDULED_BACKUP] Daily backup failed:', error);
        }
    }

    async runWeeklyCleanupJob() {
        try {
            console.log(`🕐 [SCHEDULED_CLEANUP] Weekly cleanup started at ${new Date().toLocaleString('id-ID')}`);

            const result = await runWeeklyCleanup();

            if (result.skipped) {
                console.log(`ℹ️ [SCHEDULED_CLEANUP] Weekly cleanup skipped: ${result.reason}`);
            } else {
                console.log(`✅ [SCHEDULED_CLEANUP] Weekly cleanup completed successfully`);
            }

        } catch (error) {
            console.error('❌ [SCHEDULED_CLEANUP] Weekly cleanup failed:', error);
        }
    }

    // === Helper Methods ===

    parseTimeToCron(timeString, isWeekly = false) {
        // Parse HH:MM format
        const [hours, minutes] = timeString.split(':').map(num => parseInt(num, 10));

        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new Error(`Invalid time format: ${timeString}. Expected HH:MM`);
        }

        if (isWeekly) {
            // Weekly job: every Sunday at specified time
            return `${minutes} ${hours} * * 0`;
        } else {
            // Daily job: every day at specified time
            return `${minutes} ${hours} * * *`;
        }
    }

    async getEnvValue(key, defaultValue = null) {
        try {
            const value = await getEnv(key);
            return value.replace(/^"(.*)"$/, '$1'); // Remove quotes if present
        } catch (error) {
            console.warn(`[BACKUP_SCHEDULER] Environment variable ${key} not found, using default:`, defaultValue);
            return defaultValue;
        }
    }

    // === Status Methods ===

    getStatus() {
        return {
            isRunning: this.isRunning,
            jobCount: this.jobs.size,
            jobs: Array.from(this.jobs.keys()),
            scheduledTimes: this.scheduledTimes,
            timezone: 'Asia/Jakarta'
        };
    }

    getNextScheduledRuns() {
        if (!this.isRunning) {
            return { error: 'Scheduler not running' };
        }

        const now = new Date();
        const today = new Date(now);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Calculate next daily backup
        const backupTime = this.scheduledTimes.dailyBackup;
        const [backupHours, backupMinutes] = backupTime.split(':').map(Number);

        const nextDaily = new Date(today);
        nextDaily.setHours(backupHours, backupMinutes, 0, 0);

        if (nextDaily <= now) {
            nextDaily.setDate(nextDaily.getDate() + 1);
        }

        // Calculate next weekly cleanup (next Sunday)
        const cleanupTime = this.scheduledTimes.weeklyCleanup;
        const [cleanupHours, cleanupMinutes] = cleanupTime.split(':').map(Number);

        const nextWeekly = new Date(today);
        nextWeekly.setHours(cleanupHours, cleanupMinutes, 0, 0);

        // Find next Sunday
        const daysUntilSunday = (7 - nextWeekly.getDay()) % 7;
        if (daysUntilSunday === 0 && nextWeekly <= now) {
            nextWeekly.setDate(nextWeekly.getDate() + 7);
        } else {
            nextWeekly.setDate(nextWeekly.getDate() + daysUntilSunday);
        }

        return {
            nextDailyBackup: nextDaily.toISOString(),
            nextWeeklyCleanup: nextWeekly.toISOString(),
            currentTime: now.toISOString()
        };
    }

    // === Manual Trigger Methods ===

    async triggerDailyBackup() {
        console.log('🔧 [BACKUP_SCHEDULER] Manually triggering daily backup...');
        await this.runDailyBackupJob();
    }

    async triggerWeeklyCleanup() {
        console.log('🔧 [BACKUP_SCHEDULER] Manually triggering weekly cleanup...');
        await this.runWeeklyCleanupJob();
    }
}

// Singleton instance
const backupScheduler = new BackupScheduler();

module.exports = {
    BackupScheduler,
    backupScheduler
};