// === scripts/test-database.js ===
require('dotenv').config(); // Ensure environment variables are loade
const db = require('../db');

async function testDatabase() {
    //console.log('🔍 Testing Database Queries...\n');
    
    try {
        // Test basic connection
        //console.log('1. Testing basic connection...');
        const { data, error } = await db.from('activity_logs').select('count').limit(1);
        if (error) throw error;
        //console.log('✅ Basic connection: OK');

        // Test JSONB queries
        //console.log('\n2. Testing JSONB queries...');
        const { data: jsonbTest, error: jsonbError } = await db
            .from('activity_logs')
            .select('detail')
            .not('detail', 'is', null)
            .limit(5);
        
        if (jsonbError) {
            //console.error('❌ JSONB query error:', jsonbError);
        } else {
            //console.log('✅ JSONB queries: OK');
        }

        // Test joins
        //console.log('\n3. Testing user joins...');
        const { data: joinTest, error: joinError } = await db
            .from('activity_logs')
            .select('id, users(full_name)')
            .not('user_id', 'is', null)
            .limit(3);
        
        if (joinError) {
            //console.error('❌ Join query error:', joinError);
        } else {
            //console.log('✅ Join queries: OK');
        }

        // Test batch operations
        //console.log('\n4. Testing batch operations simulation...');
        const { data: batchTest } = await db
            .from('activity_logs')
            .select('id')
            .limit(100);
        
        if (batchTest && batchTest.length > 0) {
            //console.log(`✅ Batch simulation: Found ${batchTest.length} records for testing`);
        } else {
            //console.log('⚠️ No records found for batch testing');
        }

        //console.log('\n✅ All database tests completed successfully');
        
    } catch (error) {
        //console.error('❌ Database test failed:', error);
        process.exit(1);
    }
}

testDatabase();
