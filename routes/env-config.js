const Joi = require('joi');
const { readEnv, writeEnv, reloadEnv } = require('../utils/env-manager');
const { updateGeminiKeys } = require('../utils/geminiClient');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'env-config',
    register: async function (server) {
        server.route([
            {
                method: 'GET',
                path: '/admin/env',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Ambil konfigurasi ENV (admin only)',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async () => {
                    const env = readEnv();

                    let geminiKeys = [];
                    try {
                        geminiKeys = JSON.parse(env.GEMINI_API_KEYS || '[]');
                    } catch {
                        geminiKeys = [];
                    }

                    return {
                        env: {
                            ...env,
                            GEMINI_API_KEYS: geminiKeys,
                            MAIL_SECURE: parseMailSecure(env.MAIL_SECURE),
                        },
                    };
                },
            },
            {
                method: 'PUT',
                path: '/admin/env',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Update konfigurasi ENV (admin only)',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        payload: Joi.object().pattern(Joi.string(), Joi.any()),
                    },
                },
                handler: async (req, h) => {
                    const current = readEnv();
                    const payload = { ...req.payload };

                    // Convert GEMINI_API_KEYS to JSON string if array
                    if (Array.isArray(payload.GEMINI_API_KEYS)) {
                        payload.GEMINI_API_KEYS = JSON.stringify(payload.GEMINI_API_KEYS);
                        updateGeminiKeys(JSON.parse(payload.GEMINI_API_KEYS));
                        console.log('[ENV-CONFIG] Gemini API keys diperbarui oleh admin');
                    }

                    // Normalize MAIL_SECURE
                    if (payload.hasOwnProperty('MAIL_SECURE')) {
                        if (payload.MAIL_SECURE === true || payload.MAIL_SECURE === 'true') {
                            payload.MAIL_SECURE = 'true';
                        } else if (payload.MAIL_SECURE === false || payload.MAIL_SECURE === 'false') {
                            payload.MAIL_SECURE = 'false';
                        } else {
                            payload.MAIL_SECURE = ''; // null/undefined interpreted as ""
                        }
                    }

                    const updated = { ...current, ...payload };

                    try {
                        writeEnv(updated);
                        reloadEnv();
                    } catch (err) {
                        console.error('Gagal menulis .env:', err);
                        return h
                            .response({ message: 'Gagal memperbarui .env', error: err.message })
                            .code(500);
                    }

                    return h.response({ message: '.env updated successfully' }).code(200);
                },
            },
        ]);
    },
};

function parseMailSecure(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
}
