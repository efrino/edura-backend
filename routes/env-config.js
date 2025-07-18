// const Joi = require('joi');
// const { readEnv, writeEnv, reloadEnv } = require('../utils/env-manager');
// const { updateGeminiKeys } = require('../utils/geminiClient');
// const { verifyToken, requireRole } = require('../utils/middleware');

// module.exports = {
//     name: 'env-config',
//     register: async function (server) {
//         server.route([
//             {
//                 method: 'GET',
//                 path: '/admin/env',
//                 options: {
//                     tags: ['api', 'Admin'],
//                     description: 'Ambil konfigurasi ENV (admin only)',
//                     pre: [verifyToken, requireRole('admin')],
//                 },
//                 handler: async () => {
//                     const env = readEnv();

//                     let geminiKeys = [];
//                     try {
//                         geminiKeys = JSON.parse(env.GEMINI_API_KEYS || '[]');
//                     } catch {
//                         geminiKeys = [];
//                     }

//                     return {
//                         env: {
//                             ...env,
//                             GEMINI_API_KEYS: geminiKeys,
//                             MAIL_SECURE: parseMailSecure(env.MAIL_SECURE),
//                         },
//                     };
//                 },
//             },
//             {
//                 method: 'PUT',
//                 path: '/admin/env',
//                 options: {
//                     tags: ['api', 'Admin'],
//                     description: 'Update konfigurasi ENV (admin only)',
//                     pre: [verifyToken, requireRole('admin')],
//                     validate: {
//                         payload: Joi.object().pattern(Joi.string(), Joi.any()),
//                     },
//                 },
//                 handler: async (req, h) => {
//                     const current = readEnv();
//                     const payload = { ...req.payload };

//                     // Convert GEMINI_API_KEYS to JSON string if array
//                     if (Array.isArray(payload.GEMINI_API_KEYS)) {
//                         payload.GEMINI_API_KEYS = JSON.stringify(payload.GEMINI_API_KEYS);
//                         updateGeminiKeys(JSON.parse(payload.GEMINI_API_KEYS));
//                         console.log('[ENV-CONFIG] Gemini API keys diperbarui oleh admin');
//                     }

//                     // Normalize MAIL_SECURE
//                     if (payload.hasOwnProperty('MAIL_SECURE')) {
//                         if (payload.MAIL_SECURE === true || payload.MAIL_SECURE === 'true') {
//                             payload.MAIL_SECURE = 'true';
//                         } else if (payload.MAIL_SECURE === false || payload.MAIL_SECURE === 'false') {
//                             payload.MAIL_SECURE = 'false';
//                         } else {
//                             payload.MAIL_SECURE = ''; // null/undefined interpreted as ""
//                         }
//                     }

//                     const updated = { ...current, ...payload };

//                     try {
//                         writeEnv(updated);
//                         reloadEnv();
//                     } catch (err) {
//                         console.error('Gagal menulis .env:', err);
//                         return h
//                             .response({ message: 'Gagal memperbarui .env', error: err.message })
//                             .code(500);
//                     }

//                     return h.response({ message: '.env updated successfully' }).code(200);
//                 },
//             },
//         ]);
//     },
// };

// function parseMailSecure(value) {
//     if (value === 'true') return true;
//     if (value === 'false') return false;
//     return null;
// }
const supabase = require('../db');
const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
module.exports = {
    name: 'env-config',
    version: '1.0.0',
    register: async function (server, options) {
        server.route({
            method: 'GET',
            path: '/admin/env',
            options: {
                tags: ['api', 'Admin'],
                description: 'Get all environment configs',
                pre: [verifyToken, requireRole('admin')],
            },
            handler: async () => {
                const { data, error } = await supabase.from('env_config').select('*');
                if (error) return { error: error.message };
                return data;
            },
        }),

            server.route({
                method: 'GET',
                path: '/admin/env/{key}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Get env by key',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            key: Joi.string().required(),
                        }),
                    },
                },
                handler: async (req) => {
                    const { key } = req.params;
                    const { data, error } = await supabase
                        .from('env_config')
                        .select('*')
                        .eq('key', key)
                        .maybeSingle();

                    if (error) return { error: error.message };
                    return data || {};
                },
            }),

            server.route({
                method: 'PUT',
                path: '/admin/env/{key}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Update or insert env value',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            key: Joi.string().required(),
                        }),
                        payload: Joi.object({
                            value: Joi.any().required(),
                        }),
                    },
                },
                handler: async (req) => {
                    const { key } = req.params;
                    const { value } = req.payload;

                    const { error } = await supabase
                        .from('env_config')
                        .upsert({ key, value }, { onConflict: 'key' });

                    if (error) return { error: error.message };
                    return { success: true };
                },
            }),

            server.route({
                method: 'DELETE',
                path: '/admin/env/{key}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Delete env config by key',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            key: Joi.string().required(),
                        }),
                    },
                },
                handler: async (req) => {
                    const { key } = req.params;
                    const { error } = await supabase
                        .from('env_config')
                        .delete()
                        .eq('key', key);

                    if (error) return { error: error.message };
                    return { success: true };
                },
            }),

            server.route({
                method: 'PUT',
                path: '/admin/env/gemini/activate',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Set a Gemini API key as active (set_active: true)',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        payload: Joi.object({
                            api_key: Joi.string().required(),
                        }),
                    },
                },
                handler: async (req) => {
                    const { api_key } = req.payload;

                    const { data, error } = await supabase
                        .from('env_config')
                        .select('value')
                        .eq('key', 'GEMINI_API_KEYS')
                        .maybeSingle();

                    if (error || !data) {
                        return { error: 'Gagal mengambil data GEMINI_API_KEYS' };
                    }

                    const keys = Array.isArray(data.value) ? data.value : [];

                    const updated = keys.map((k) => ({
                        ...k,
                        set_active: k.api_key === api_key,
                    }));

                    const { error: updateError } = await supabase
                        .from('env_config')
                        .update({ value: updated })
                        .eq('key', 'GEMINI_API_KEYS');

                    if (updateError) return { error: updateError.message };
                    return { success: true };
                },
            });
    }
};