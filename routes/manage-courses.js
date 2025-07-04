const Joi = require('joi');
const Boom = require('@hapi/boom');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'admin-manage-courses',
    version: '1.0.0',
    register: async function (server) {
        server.route([
            // === GET /admin/courses?search=react&page=1&limit=10
            {
                method: 'GET',
                path: '/admin/courses',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'List all courses (with pagination & search)',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        query: Joi.object({
                            search: Joi.string().allow('', null),
                            page: Joi.number().min(1).default(1),
                            limit: Joi.number().min(1).max(100).default(10)
                        })
                    }
                },
                handler: async (req, h) => {
                    const { search, page, limit } = req.query;
                    const offset = (page - 1) * limit;

                    let query = db
                        .from('courses')
                        .select('*', { count: 'exact' })
                        .order('created_at', { ascending: false })
                        .range(offset, offset + limit - 1);

                    if (search) {
                        query = query.or(`title.ilike.%${search}%,subject.ilike.%${search}%`);
                    }

                    const { data, error, count } = await query;
                    if (error) throw error;

                    return {
                        data,
                        total: count,
                        page,
                        totalPages: Math.ceil(count / limit),
                    };
                }
            },

            // === GET /admin/courses/{id}
            {
                method: 'GET',
                path: '/admin/courses/{id}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Get course detail by ID (with sessions)',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const courseId = req.params.id;

                    // Ambil course
                    const { data: course, error: courseErr } = await db
                        .from('courses')
                        .select('*')
                        .eq('id', courseId)
                        .maybeSingle();

                    if (courseErr || !course) {
                        return Boom.notFound('Course tidak ditemukan');
                    }

                    // Ambil sesi-sesi
                    const { data: sessions, error: sessionErr } = await db
                        .from('course_sessions')
                        .select('session_number, title, content')
                        .eq('course_id', courseId)
                        .order('session_number', { ascending: true });

                    if (sessionErr) throw sessionErr;

                    return {
                        course,
                        sessions
                    };
                }
            },

            // === PUT /admin/courses/{id}
            {
                method: 'PUT',
                path: '/admin/courses/{id}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Update course',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                        }),
                        payload: Joi.object({
                            title: Joi.string().required(),
                            description: Joi.string().allow('').optional(),
                            subject: Joi.string().required(),
                            level: Joi.string().valid('beginner', 'intermediate', 'expert').required(),
                            program_studi: Joi.string().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const { id } = req.params;
                    const { title, description, subject, level, program_studi } = req.payload;

                    const { error } = await db
                        .from('courses')
                        .update({ title, description, subject, level, program_studi })
                        .eq('id', id);

                    if (error) throw error;

                    return { message: 'Course berhasil diupdate' };
                }
            },

            // === DELETE /admin/courses/{id}
            {
                method: 'DELETE',
                path: '/admin/courses/{id}',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Hapus course beserta sesi-sesinya (karena ON DELETE CASCADE)',
                    pre: [verifyToken, requireRole('admin')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                        }),
                    }
                },
                handler: async (req, h) => {
                    const { id } = req.params;

                    const { error } = await db
                        .from('courses')
                        .delete()
                        .eq('id', id);

                    if (error) throw error;

                    return { message: 'Course berhasil dihapus' };
                }
            }
        ]);
    }
};
