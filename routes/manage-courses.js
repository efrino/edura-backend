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
                            search: Joi.string().allow('', null).optional(),
                            page: Joi.number().min(1).default(1),
                            limit: Joi.number().min(1).max(1000).default(10),
                            level: Joi.string().valid('beginner', 'intermediate', 'expert').optional(),
                            subject: Joi.string().optional(),
                            program_studi: Joi.string().optional()
                        })
                    }
                },
                handler: async (req, h) => {
                    try {
                        const { search, page, limit, level, subject, program_studi } = req.query;
                        const offset = (page - 1) * limit;

                        let query = db
                            .from('courses')
                            .select('*', { count: 'exact' })
                            .order('created_at', { ascending: false });

                        // Apply filters
                        if (search && search.trim()) {
                            query = query.or(`title.ilike.%${search.trim()}%,subject.ilike.%${search.trim()}%`);
                        }

                        if (level) {
                            query = query.eq('level', level);
                        }

                        if (subject) {
                            query = query.eq('subject', subject);
                        }

                        if (program_studi) {
                            query = query.eq('program_studi', program_studi);
                        }

                        // Apply pagination
                        query = query.range(offset, offset + limit - 1);

                        const { data, error, count } = await query;

                        if (error) {
                            console.error('Database error:', error);
                            throw error;
                        }

                        return {
                            data: data || [],
                            total: count || 0,
                            page,
                            totalPages: Math.ceil((count || 0) / limit),
                        };
                    } catch (error) {
                        console.error('Error in GET /admin/courses:', error);
                        throw Boom.internal('Failed to fetch courses');
                    }
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
                    try {
                        const courseId = req.params.id;

                        // Ambil course
                        const { data: course, error: courseErr } = await db
                            .from('courses')
                            .select('*')
                            .eq('id', courseId)
                            .maybeSingle();

                        if (courseErr) {
                            console.error('Error fetching course:', courseErr);
                            throw courseErr;
                        }

                        if (!course) {
                            return Boom.notFound('Course tidak ditemukan');
                        }

                        // Ambil sesi-sesi
                        const { data: sessions, error: sessionErr } = await db
                            .from('course_sessions')
                            .select('session_number, title, content')
                            .eq('course_id', courseId)
                            .order('session_number', { ascending: true });

                        if (sessionErr) {
                            console.error('Error fetching sessions:', sessionErr);
                            throw sessionErr;
                        }

                        return {
                            course,
                            sessions: sessions || []
                        };
                    } catch (error) {
                        console.error('Error in GET /admin/courses/{id}:', error);
                        if (error.isBoom) throw error;
                        throw Boom.internal('Failed to fetch course detail');
                    }
                }
            },

            // === PUT /admin/courses/{id} - FIXED VERSION
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
                            title: Joi.string().min(1).max(255).required(),
                            description: Joi.string().allow('', null).optional(),
                            subject: Joi.string().min(1).max(100).required(),
                            level: Joi.string().valid('beginner', 'intermediate', 'expert').required(),
                            program_studi: Joi.string().min(1).max(100).optional()
                        })
                    }
                },
                handler: async (req, h) => {
                    try {
                        const { id } = req.params;
                        const updateData = req.payload;

                        // Check if course exists
                        const { data: existingCourse, error: checkError } = await db
                            .from('courses')
                            .select('id')
                            .eq('id', id)
                            .maybeSingle();

                        if (checkError) {
                            console.error('Error checking course:', checkError);
                            throw checkError;
                        }

                        if (!existingCourse) {
                            return Boom.notFound('Course tidak ditemukan');
                        }

                        // FIXED: Removed updated_at since column doesn't exist in schema
                        // Only update the payload data
                        const { error } = await db
                            .from('courses')
                            .update(updateData)
                            .eq('id', id);

                        if (error) {
                            console.error('Error updating course:', error);
                            throw error;
                        }

                        return { message: 'Course berhasil diupdate' };
                    } catch (error) {
                        console.error('Error in PUT /admin/courses/{id}:', error);
                        if (error.isBoom) throw error;
                        throw Boom.internal('Failed to update course');
                    }
                }
            },

            // === GET /admin/courses/export - Export courses to CSV
            {
                method: 'GET',
                path: '/admin/courses/export',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Export all courses to CSV',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async (req, h) => {
                    try {
                        // Get all courses
                        const { data: courses, error } = await db
                            .from('courses')
                            .select('*')
                            .order('created_at', { ascending: false });

                        if (error) {
                            console.error('Error fetching courses for export:', error);
                            throw error;
                        }

                        // Prepare CSV data
                        const csvData = (courses || []).map(course => ({
                            'ID': course.id || '',
                            'Title': course.title || '',
                            'Subject': course.subject || '',
                            'Level': course.level || '',
                            'Program Studi': course.program_studi || '',
                            'Description': (course.description || '').replace(/"/g, '""'), // Escape quotes
                            'Verified': course.is_verified ? 'Yes' : 'No',
                            'Created At': course.created_at ? new Date(course.created_at).toLocaleDateString('id-ID') : '',
                            'Total Sessions': course.total_sessions || 0
                        }));

                        // Convert to CSV
                        const Papa = require('papaparse');
                        const csv = Papa.unparse(csvData);

                        // Return CSV file
                        return h.response(csv)
                            .type('text/csv')
                            .header('Content-Disposition', `attachment; filename=courses-${Date.now()}.csv`);
                    } catch (error) {
                        console.error('Error exporting courses:', error);
                        throw Boom.internal('Failed to export courses');
                    }
                }
            },

            // === GET /admin/courses/statistics - Get course statistics
            {
                method: 'GET',
                path: '/admin/courses/statistics',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Get course statistics',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async (req, h) => {
                    try {
                        // Get all courses for statistics
                        const { data: courses, error } = await db
                            .from('courses')
                            .select('level, is_verified, created_at');

                        if (error) {
                            console.error('Error fetching courses for statistics:', error);
                            throw error;
                        }

                        const now = new Date();
                        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

                        const stats = {
                            totalCourses: courses?.length || 0,
                            beginnerCourses: courses?.filter(c => c.level === 'beginner').length || 0,
                            intermediateCourses: courses?.filter(c => c.level === 'intermediate').length || 0,
                            expertCourses: courses?.filter(c => c.level === 'expert').length || 0,
                            verifiedCourses: courses?.filter(c => c.is_verified === true).length || 0,
                            unverifiedCourses: courses?.filter(c => c.is_verified === false || c.is_verified === null).length || 0,
                            thisMonthCourses: courses?.filter(c =>
                                c.created_at && new Date(c.created_at) >= startOfMonth
                            ).length || 0
                        };

                        return stats;
                    } catch (error) {
                        console.error('Error getting course statistics:', error);
                        throw Boom.internal('Failed to get statistics');
                    }
                }
            },

            // === GET /admin/courses/subjects - Get unique subjects
            {
                method: 'GET',
                path: '/admin/courses/subjects',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Get unique subjects for filter',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async (req, h) => {
                    try {
                        const { data: courses, error } = await db
                            .from('courses')
                            .select('subject')
                            .not('subject', 'is', null);

                        if (error) {
                            console.error('Error fetching subjects:', error);
                            throw error;
                        }

                        const subjects = [...new Set((courses || []).map(c => c.subject).filter(Boolean))].sort();
                        return subjects;
                    } catch (error) {
                        console.error('Error getting unique subjects:', error);
                        throw Boom.internal('Failed to get subjects');
                    }
                }
            },

            // === GET /admin/courses/programs - Get unique program studi
            {
                method: 'GET',
                path: '/admin/courses/programs',
                options: {
                    tags: ['api', 'Admin'],
                    description: 'Get unique program studi for filter',
                    pre: [verifyToken, requireRole('admin')],
                },
                handler: async (req, h) => {
                    try {
                        const { data: courses, error } = await db
                            .from('courses')
                            .select('program_studi')
                            .not('program_studi', 'is', null);

                        if (error) {
                            console.error('Error fetching program studi:', error);
                            throw error;
                        }

                        const programs = [...new Set((courses || []).map(c => c.program_studi).filter(Boolean))].sort();
                        return programs;
                    } catch (error) {
                        console.error('Error getting unique program studi:', error);
                        throw Boom.internal('Failed to get program studi');
                    }
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
                    try {
                        const { id } = req.params;

                        // Check if course exists
                        const { data: existingCourse, error: checkError } = await db
                            .from('courses')
                            .select('id, title')
                            .eq('id', id)
                            .maybeSingle();

                        if (checkError) {
                            console.error('Error checking course:', checkError);
                            throw checkError;
                        }

                        if (!existingCourse) {
                            return Boom.notFound('Course tidak ditemukan');
                        }

                        // Delete course (will cascade delete sessions due to foreign key constraint)
                        const { error } = await db
                            .from('courses')
                            .delete()
                            .eq('id', id);

                        if (error) {
                            console.error('Error deleting course:', error);
                            throw error;
                        }

                        return {
                            message: 'Course berhasil dihapus',
                            deletedCourse: existingCourse.title
                        };
                    } catch (error) {
                        console.error('Error in DELETE /admin/courses/{id}:', error);
                        if (error.isBoom) throw error;
                        throw Boom.internal('Failed to delete course');
                    }
                }
            }

        ]);

    }
};