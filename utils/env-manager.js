const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '.env');

function readEnv() {
    const env = fs.readFileSync(envPath, 'utf-8');
    return dotenv.parse(env);
}

function writeEnv(data) {
    const serialized = Object.entries(data)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');

    fs.writeFileSync(envPath, serialized);
}

// Dynamic loader: memperbarui process.env secara langsung
function reloadEnv() {
    const parsed = readEnv();
    for (const [key, value] of Object.entries(parsed)) {
        process.env[key] = value;
    }
    console.log('[ENV] process.env diperbarui ulang dari file .env');
}

module.exports = { readEnv, writeEnv, reloadEnv };
