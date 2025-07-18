// utils/env.js
const supabase = require('../db');

async function getEnv(key) {
    const { data, error } = await supabase
        .from('env_config')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error || !data) {
        throw new Error(`[ENV] Tidak bisa mengambil key: ${key}`);
    }

    return data.value;
}

module.exports = {
    getEnv
};
