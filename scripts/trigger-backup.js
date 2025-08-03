// === scripts/trigger-backup.js ===
require('dotenv').config();
async function triggerManualBackup() {
    //console.log('🔧 Triggering Manual Backup...\n');
    
    try {
        const { runDailyBackup } = require('../worker/log-backup-worker');
        
        //console.log('Starting backup process...');
        const result = await runDailyBackup();
        
        if (result.skipped) {
            //console.log(`⚠️ Backup skipped: ${result.reason}`);
        } else {
            //console.log('✅ Backup completed successfully!');
            //console.log(`📁 Filename: ${result.filename}`);
            //console.log(`📊 Logs backed up: ${result.logCount}`);
            //console.log(`🗑️ Logs deleted: ${result.deletedCount}`);
            //console.log(`📧 Emails sent: ${result.emailsSent}`);
        }
        
    } catch (error) {
        //console.error('❌ Backup failed:', error);
        process.exit(1);
    }
}

triggerManualBackup();