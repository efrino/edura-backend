// === scripts/backup-status.js ===
require('dotenv').config(); // Ensure environment variables are loade
const db = require('../db');

async function checkBackupStatus() {
    //console.log('📊 Backup System Status Report');
    //console.log('='.repeat(50));

    try {
        // Recent backup activities
        const { data: recentBackups } = await db
            .from('activity_logs')
            .select('action, detail, created_at, users(full_name)')
            .in('action', ['AUTO_BACKUP', 'BACKUP_DOWNLOAD', 'BACKUP_AND_CLEANUP', 'AUTO_CLEANUP'])
            .order('created_at', { ascending: false })
            .limit(10);

        //console.log(`\n📦 Recent Backup Activities (${recentBackups?.length || 0}):`);
        if (recentBackups && recentBackups.length > 0) {
            recentBackups.forEach(backup => {
                const date = new Date(backup.created_at).toLocaleString('id-ID');
                const user = backup.users?.full_name || 'System';
                const detail = backup.detail?.filename || JSON.stringify(backup.detail) || 'No detail';
                //console.log(`   ${date} - ${backup.action} by ${user}`);
                //console.log(`     Detail: ${detail}`);
            });
        } else {
            //console.log('   No backup activities found');
        }

        // Today's log count
        const today = new Date().toISOString().slice(0, 10);
        const { count: todayCount } = await db
            .from('activity_logs')
            .select('id', { count: 'exact' })
            .gte('created_at', `${today}T00:00:00.000Z`)
            .lte('created_at', `${today}T23:59:59.999Z`);

        //console.log(`\n📊 Today's Log Count (${today}): ${todayCount || 0}`);

        // Total log count
        const { count: totalCount } = await db
            .from('activity_logs')
            .select('id', { count: 'exact' });

        //console.log(`📊 Total Log Count: ${totalCount || 0}`);

        // Environment status
        const { data: envConfig } = await db
            .from('env_config')
            .select('key, value')
            .like('key', '%BACKUP%');

        //console.log('\n⚙️ Backup Configuration:');
        envConfig?.forEach(config => {
            //console.log(`   ${config.key}: ${config.value}`);
        });

        //console.log('\n✅ Status check completed');

    } catch (error) {
        //console.error('❌ Error checking status:', error);
        process.exit(1);
    }
}

checkBackupStatus();