// === scripts/test-backup.js ===
require('dotenv').config(); // Tambahkan baris ini paling atas
const db = require('../db/index');

async function testBackupSystem() {
    //console.log('🧪 Testing Backup System Components...\n');

    try {
        // Test 1: Database Connection
        //console.log('1. Testing database connection...');
        const { data, error } = await db.from('activity_logs').select('id').limit(1);
        if (error) throw error;
        //console.log('✅ Database connection: OK\n');

        // Test 2: Environment Config
        //console.log('2. Testing environment config...');
        const { data: envData } = await db
            .from('env_config')
            .select('key, value')
            .in('key', ['BACKUP_ENABLED', 'BACKUP_TIME', 'ADMIN_BACKUP_EMAILS']);

        //console.log('📋 Environment config:');
        envData.forEach(env => {
            //console.log(`   ${env.key}: ${env.value}`);
        });
        //console.log('');

        // Test 3: Admin Users
        //console.log('3. Testing admin users...');
        const { data: admins } = await db
            .from('users')
            .select('email, full_name')
            .eq('role', 'admin')
            .eq('is_verified', true);

        //console.log(`📧 Found ${admins?.length || 0} admin users:`);
        admins?.forEach(admin => {
            //console.log(`   ${admin.full_name} <${admin.email}>`);
        });
        //console.log('');

        // Test 4: Log Count Check
        //console.log('4. Testing log count...');
        const today = new Date().toISOString().slice(0, 10);
        const { count } = await db
            .from('activity_logs')
            .select('id', { count: 'exact' })
            .gte('created_at', `${today}T00:00:00.000Z`)
            .lte('created_at', `${today}T23:59:59.999Z`);

        //console.log(`📊 Logs today (${today}): ${count || 0} entries\n`);

        // Test 5: JSONB Query Test
        //console.log('5. Testing JSONB queries...');
        const { data: backupLogs } = await db
            .from('activity_logs')
            .select('detail')
            .in('action', ['BACKUP_DOWNLOAD', 'AUTO_BACKUP'])
            .not('detail', 'is', null)
            .limit(5);

        //console.log(`🔍 Found ${backupLogs?.length || 0} backup-related logs\n`);

        //console.log('✅ All tests passed! Backup system should work correctly.');

    } catch (error) {
        //console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testBackupSystem();
