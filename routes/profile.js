const Joi = require('joi');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'profile-routes',
    register: async function (server) {
        server.route([
            // 🧑 GET /profile - Enhanced with student profile for class_id
            {
                method: 'GET',
                path: '/profile',
                options: {
                    pre: [{ method: verifyToken }],
                    tags: ['api', 'Profil'],
                },
                handler: async (req, h) => {
                    const { id, role } = req.auth.credentials;

                    try {
                        // Get basic user info
                        const { data: user, error } = await db
                            .from('users')
                            .select('id, full_name, email, role, is_verified')
                            .eq('id', id)
                            .maybeSingle();

                        if (error) throw error;
                        if (!user) return h.response({ error: 'User not found' }).code(404);

                        let profileData = { profile: user };

                        // If user is student, get student profile with class info
                        if (role === 'student') {
                            const { data: studentProfile, error: studentError } = await db
                                .from('student_profiles')
                                .select(`
                                    nim,
                                    full_name,
                                    jurusan,
                                    program_studi,
                                    perguruan_tinggi,
                                    class_id,
                                    created_at,
                                    updated_at,
                                    classes (
                                        id,
                                        name,
                                        class_code
                                    )
                                `)
                                .eq('user_id', id)
                                .maybeSingle();

                            if (!studentError && studentProfile) {
                                profileData.profile.student_profile = {
                                    nim: studentProfile.nim,
                                    full_name: studentProfile.full_name,
                                    jurusan: studentProfile.jurusan,
                                    program_studi: studentProfile.program_studi,
                                    perguruan_tinggi: studentProfile.perguruan_tinggi,
                                    class_id: studentProfile.class_id,
                                    kelas: studentProfile.classes?.name || null,
                                    class_code: studentProfile.classes?.class_code || null,
                                    created_at: studentProfile.created_at,
                                    updated_at: studentProfile.updated_at
                                };

                                // Add class_id to main profile for easy access
                                profileData.profile.class_id = studentProfile.class_id;
                            }
                        }

                        return profileData;
                    } catch (err) {
                        console.error('🔥 Error GET /profile', err);
                        return h.response({ error: 'Failed to fetch profile' }).code(500);
                    }
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

            // // === GET /me (profile)
            {
                method: 'GET',
                path: '/me',
                options: {
                    tags: ['api', 'User'],
                    description: 'Get current logged-in user',
                    pre: [verifyToken],
                },
                handler: async (request, h) => {
                    const user = request.auth.credentials;
                    return h.response(user).code(200);
                }
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