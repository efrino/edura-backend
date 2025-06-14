const Joi = require('joi');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');

module.exports = {
    name: 'course-verification-routes',
    version: '1.0.0',
    register: async function (server) {
        server.route([
            // ✅ PUT /teacher/courses/{id}/edit
            {
                method: 'PUT',
                path: '/teacher/courses/{id}/edit',
                options: {
                    tags: ['api', 'Course'],
                    description: 'Edit course title and description (before verification)',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                        }),
                        payload: Joi.object({
                            title: Joi.string().required(),
                            description: Joi.string().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const courseId = req.params.id;
                    const { title, description } = req.payload;

                    const { data: teacher, error } = await db
                        .from('teacher_profiles')
                        .select('program_studi')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error || !teacher) {
                        return h.response({ message: 'Profil teacher tidak ditemukan' }).code(404);
                    }

                    const { data: course, error: courseError } = await db
                        .from('courses')
                        .select('program_studi, is_verified')
                        .eq('id', courseId)
                        .maybeSingle();

                    if (courseError || !course) {
                        return h.response({ message: 'Course tidak ditemukan' }).code(404);
                    }

                    if (course.program_studi !== teacher.program_studi) {
                        return h.response({ message: 'Tidak berwenang edit course ini' }).code(403);
                    }

                    if (course.is_verified) {
                        return h.response({ message: 'Course sudah diverifikasi dan tidak bisa diedit' }).code(400);
                    }

                    const { error: updateError } = await db
                        .from('courses')
                        .update({ title, description })
                        .eq('id', courseId);

                    if (updateError) throw updateError;

                    return { message: 'Course berhasil diupdate' };
                }
            },

            // ✅ PUT /teacher/courses/{id}/sessions/{sessionNumber}
            {
                method: 'PUT',
                path: '/teacher/courses/{id}/sessions/{sessionNumber}',
                options: {
                    tags: ['api', 'Course'],
                    description: 'Edit session title & content before verification',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                            sessionNumber: Joi.number().min(1).max(16).required()
                        }),
                        payload: Joi.object({
                            title: Joi.string().required(),
                            content: Joi.object({
                                overview: Joi.string().required(),
                                steps: Joi.array().items(Joi.string()).required()
                            }).required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { id: courseId, sessionNumber } = req.params;
                    const { title, content } = req.payload;

                    const { data: teacher, error } = await db
                        .from('teacher_profiles')
                        .select('program_studi')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error || !teacher) {
                        return h.response({ message: 'Profil teacher tidak ditemukan' }).code(404);
                    }

                    const { data: course, error: courseError } = await db
                        .from('courses')
                        .select('program_studi, is_verified')
                        .eq('id', courseId)
                        .maybeSingle();

                    if (courseError || !course) {
                        return h.response({ message: 'Course tidak ditemukan' }).code(404);
                    }

                    if (course.program_studi !== teacher.program_studi) {
                        return h.response({ message: 'Tidak berwenang edit course ini' }).code(403);
                    }

                    if (course.is_verified) {
                        return h.response({ message: 'Course sudah diverifikasi dan tidak bisa diedit' }).code(400);
                    }

                    const { error: updateError } = await db
                        .from('course_sessions')
                        .update({
                            title,
                            content: JSON.stringify(content)
                        })
                        .eq('course_id', courseId)
                        .eq('session_number', sessionNumber);

                    if (updateError) throw updateError;

                    return { message: `Sesi ${sessionNumber} berhasil diupdate` };
                }
            }
            ,
            // ✅ GET /teacher/courses/unverified
            {
                method: 'GET',
                path: '/teacher/courses/unverified',
                options: {
                    tags: ['api', 'Course'],
                    description: 'List all unverified courses in teacher\'s program studi',
                    pre: [verifyToken, requireRole('teacher')],
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;

                    // Ambil teacher profile
                    const { data: teacher, error } = await db
                        .from('teacher_profiles')
                        .select('full_name, program_studi')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error || !teacher) {
                        return h.response({ message: 'Profil teacher tidak ditemukan' }).code(404);
                    }

                    const { data: courses, error: courseErr } = await db
                        .from('courses')
                        .select('*')
                        .eq('program_studi', teacher.program_studi)
                        .eq('is_verified', false);

                    if (courseErr) throw courseErr;
                    return courses;
                }
            },

            // ✅ PUT /teacher/courses/{id}/verify
            {
                method: 'PUT',
                path: '/teacher/courses/{id}/verify',
                options: {
                    tags: ['api', 'Course'],
                    description: 'Verify a course',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                        })
                    }
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const courseId = req.params.id;

                    // Ambil teacher profile
                    const { data: teacher, error } = await db
                        .from('teacher_profiles')
                        .select('full_name, program_studi')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error || !teacher) {
                        return h.response({ message: 'Profil teacher tidak ditemukan' }).code(404);
                    }

                    // Ambil course
                    const { data: course, error: courseError } = await db
                        .from('courses')
                        .select('id, program_studi, is_verified')
                        .eq('id', courseId)
                        .maybeSingle();

                    if (courseError || !course) {
                        return h.response({ message: 'Course tidak ditemukan' }).code(404);
                    }

                    if (course.program_studi !== teacher.program_studi) {
                        return h.response({ message: 'Anda tidak berwenang memverifikasi course ini' }).code(403);
                    }

                    if (course.is_verified) {
                        return h.response({ message: 'Course sudah diverifikasi' }).code(400);
                    }

                    // Update course
                    const { error: updateError } = await db
                        .from('courses')
                        .update({
                            is_verified: true,
                            verified_by: teacher.full_name
                        })
                        .eq('id', courseId);

                    if (updateError) throw updateError;

                    return { message: 'Course berhasil diverifikasi' };
                }
            },
            // ✅ DELETE /teacher/courses/{id}/sessions/{sessionNumber}
            {
                method: 'DELETE',
                path: '/teacher/courses/{id}/sessions/{sessionNumber}',
                options: {
                    tags: ['api', 'Course'],
                    description: 'Delete a session before course is verified',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required(),
                            sessionNumber: Joi.number().min(1).max(16).required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const { id: courseId, sessionNumber } = req.params;

                    const { data: teacher, error } = await db
                        .from('teacher_profiles')
                        .select('program_studi')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error || !teacher) {
                        return h.response({ message: 'Profil teacher tidak ditemukan' }).code(404);
                    }

                    const { data: course, error: courseError } = await db
                        .from('courses')
                        .select('program_studi, is_verified')
                        .eq('id', courseId)
                        .maybeSingle();

                    if (courseError || !course) {
                        return h.response({ message: 'Course tidak ditemukan' }).code(404);
                    }

                    if (course.program_studi !== teacher.program_studi) {
                        return h.response({ message: 'Tidak berwenang menghapus sesi ini' }).code(403);
                    }

                    if (course.is_verified) {
                        return h.response({ message: 'Course sudah diverifikasi dan tidak bisa diubah' }).code(400);
                    }

                    const { error: deleteError } = await db
                        .from('course_sessions')
                        .delete()
                        .eq('course_id', courseId)
                        .eq('session_number', sessionNumber);

                    if (deleteError) throw deleteError;

                    return { message: `Sesi ${sessionNumber} berhasil dihapus` };
                }
            },
            // ✅ PUT /teacher/courses/{id}/revert
            {
                method: 'PUT',
                path: '/teacher/courses/{id}/revert',
                options: {
                    tags: ['api', 'Course'],
                    description: 'Revert course: hapus semua sesi & reset title/description (sebelum verifikasi)',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required()
                        }),
                        payload: Joi.object({
                            title: Joi.string().required(),
                            description: Joi.string().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const courseId = req.params.id;
                    const { title, description } = req.payload;

                    const { data: teacher, error } = await db
                        .from('teacher_profiles')
                        .select('program_studi')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (error || !teacher) {
                        return h.response({ message: 'Profil teacher tidak ditemukan' }).code(404);
                    }

                    const { data: course, error: courseError } = await db
                        .from('courses')
                        .select('program_studi, is_verified')
                        .eq('id', courseId)
                        .maybeSingle();

                    if (courseError || !course) {
                        return h.response({ message: 'Course tidak ditemukan' }).code(404);
                    }

                    if (course.program_studi !== teacher.program_studi) {
                        return h.response({ message: 'Tidak berwenang revert course ini' }).code(403);
                    }

                    if (course.is_verified) {
                        return h.response({ message: 'Course sudah diverifikasi dan tidak bisa direvert' }).code(400);
                    }

                    // Hapus semua session
                    const { error: delError } = await db
                        .from('course_sessions')
                        .delete()
                        .eq('course_id', courseId);

                    if (delError) throw delError;

                    // Reset title & description
                    const { error: updError } = await db
                        .from('courses')
                        .update({ title, description })
                        .eq('id', courseId);

                    if (updError) throw updError;

                    return { message: 'Course berhasil direvert dan direset' };
                }
            },
            // ✅ GET /teacher/courses/{id}/detail
            {
                method: 'GET',
                path: '/teacher/courses/{id}/detail',
                options: {
                    tags: ['api', 'Course'],
                    description: 'Get full course detail with all sessions',
                    pre: [verifyToken, requireRole('teacher')],
                    validate: {
                        params: Joi.object({
                            id: Joi.string().uuid().required()
                        })
                    }
                },
                handler: async (req, h) => {
                    const userId = req.auth.credentials.id;
                    const courseId = req.params.id;

                    // Cek profil teacher
                    const { data: teacher, error: teacherErr } = await db
                        .from('teacher_profiles')
                        .select('program_studi')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (teacherErr || !teacher) {
                        return h.response({ message: 'Profil teacher tidak ditemukan' }).code(404);
                    }

                    // Ambil course dan semua session-nya
                    const { data: course, error: courseErr } = await db
                        .from('courses')
                        .select('*')
                        .eq('id', courseId)
                        .maybeSingle();

                    if (courseErr || !course) {
                        return h.response({ message: 'Course tidak ditemukan' }).code(404);
                    }

                    if (course.program_studi !== teacher.program_studi) {
                        return h.response({ message: 'Tidak berwenang mengakses course ini' }).code(403);
                    }

                    // Ambil semua session berdasarkan urutan session_number
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
            }

        ]);
    }
};
