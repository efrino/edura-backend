const db = require('../db'); // Supabase client

async function logActivity({ user_id, role, action, detail }) {
    try {
        await db.from('activity_logs').insert({
            user_id,
            role,
            action,
            detail,
        });
    } catch (err) {
        //console.error('❌ Gagal menyimpan log ke Supabase:', err.message);
    }
}

async function getLogs(limit = 100) {
    const { data, error } = await db
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        //console.error('❌ Gagal mengambil log dari Supabase:', error.message);
        return [];
    }

    return data;
}

module.exports = { logActivity, getLogs };
