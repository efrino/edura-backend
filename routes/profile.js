const Joi = require('joi');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'profile-routes',
    register: async function (server) {
        server.route([
            // 🧑 GET /profile
            {
                method: 'GET',
                path: '/profile',
                options: {
                    pre: [{ method: verifyToken }],
                    tags: ['api', 'Profil'],
                },
                handler: async (req, h) => {
                    const { id } = req.auth.credentials;
                    const { data, error } = await db
                        .from('users')
                        .select('id, full_name, email, role, is_verified')
                        .eq('id', id)
                        .maybeSingle();

                    if (error) {
                        console.error('🔥 Error GET /profile', error);
                        return h.response({ error: 'Failed to fetch profile' }).code(500);
                    }

                    return { profile: data };
                },
            },

            // 📝 PUT /profile
            {
                method: 'PUT',
                path: '/profile',
                options: {
                    pre: [{ method: verifyToken }],
                    tags: ['api', 'Profil'],
                    validate: {
                        payload: Joi.object({
                            full_name: Joi.string().min(3),
                            email: Joi.string().email(),
                            old_password: Joi.string(),
                            new_password: Joi.string().min(6),
                        }).or('full_name', 'email', 'new_password'),
                    },
                },
                handler: async (req, h) => {
                    const { id } = req.auth.credentials;
                    const { full_name, email, old_password, new_password } = req.payload;

                    try {
                        const updates = {};
                        if (full_name) updates.full_name = full_name;
                        if (email) updates.email = email;

                        // If changing password
                        if (new_password) {
                            const { data: user, error } = await db
                                .from('users')
                                .select('password_hash')
                                .eq('id', id)
                                .maybeSingle();

                            if (error) throw error;
                            const match = await bcrypt.compare(old_password, user.password_hash);
                            if (!match) return h.response({ error: 'Old password is incorrect' }).code(401);

                            updates.password_hash = await bcrypt.hash(new_password, 10);
                        }

                        const { error: e2 } = await db.from('users').update(updates).eq('id', id);
                        if (e2) throw e2;

                        return { message: 'Profile updated successfully' };
                    } catch (err) {
                        console.error('🔥 Error PUT /profile', err);
                        return h.response({ error: 'Failed to update profile' }).code(500);
                    }
                },
            },

            // ❌ DELETE /users/{id} → Hanya Admin
            {
                method: 'DELETE',
                path: '/users/{id}',
                options: {
                    pre: [{ method: verifyToken }, { method: requireRole('admin') }],
                    tags: ['api', 'Profil'],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                        }),
                    },
                },
                handler: async (req, h) => {
                    const { id } = req.params;

                    try {
                        const { error } = await db.from('users').delete().eq('id', id);
                        if (error) throw error;

                        return { message: 'User deleted successfully' };
                    } catch (err) {
                        console.error('🔥 Error DELETE /users', err);
                        return h.response({ error: 'Failed to delete user' }).code(500);
                    }
                },
            }
        ]);
    },
};
