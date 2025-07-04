const Joi = require('joi');
const db = require('../db');
const Boom = require('@hapi/boom');
const { verifyToken, requireRole } = require('../utils/middleware');
const { sendStudentNotification } = require('../utils/email');

module.exports = {
    name: 'teacher-student-monitoring',
    version: '1.0.0',
    register: async function (server, options) {
        // === GET /teacher/class-monitoring ===
        server.route({
            method: 'GET',
            path: '/teacher/class-monitoring',
            options: {
                tags: ['api', 'Teacher'],
                description: 'Monitor semua student dalam class milik teacher',
                pre: [verifyToken, requireRole('teacher')],
            },
            handler: async (request, h) => {
                const teacherId = request.auth.credentials.id;

                // Ambil class_id teacher
                const { data: teacher, error: teacherErr } = await db
                    .from('teacher_profiles')
                    .select('class_id')
                    .eq('user_id', teacherId)
                    .maybeSingle();

                if (teacherErr || !teacher || !teacher.class_id) {
                    return Boom.notFound('Teacher belum memiliki kelas');
                }

                const classId = teacher.class_id;

                // Ambil siswa dalam kelas tersebut
                const { data: students, error: studentErr } = await db
                    .from('student_profiles')
                    .select('id, user_id, full_name')
                    .eq('class_id', classId);

                if (studentErr) return Boom.internal('Gagal ambil siswa');

                const userIds = students.map((s) => s.user_id);
                const studentIds = students.map((s) => s.id);

                const { data: users, error: userErr } = await db
                    .from('users')
                    .select('id, email')
                    .in('id', userIds);

                if (userErr) return Boom.internal('Gagal ambil data user');

                const userMap = Object.fromEntries(users.map((u) => [u.id, u.email]));

                const { data: progressList, error: progressErr } = await db
                    .from('student_courses')
                    .select('student_id, course_id, checkpoint')
                    .in('student_id', studentIds);

                if (progressErr) return Boom.internal('Gagal ambil progress');

                const courseIds = [...new Set(progressList.map(p => p.course_id))];

                const { data: sessionCounts, error: sessionErr } = await db
                    .from('course_sessions')
                    .select('course_id, count(*)')
                    .in('course_id', courseIds)
                    .group('course_id');

                if (sessionErr) return Boom.internal('Gagal hitung sesi');

                const courseMap = Object.fromEntries(sessionCounts.map(item => [
                    item.course_id, parseInt(item.count)
                ]));

                const summary = students.map(student => {
                    const email = userMap[student.user_id] || '-';
                    const studentCourses = progressList.filter(c => c.student_id === student.id);

                    const progress = studentCourses.map(course => {
                        const total = Math.max(courseMap[course.course_id] || 1, 1);
                        const percent = Math.min(100, Math.round((course.checkpoint / total) * 100));
                        return { course_id: course.course_id, percent };
                    });

                    const avgProgress = progress.length
                        ? Math.round(progress.reduce((sum, p) => sum + p.percent, 0) / progress.length)
                        : 0;

                    return {
                        id: student.id,
                        name: student.full_name,
                        email,
                        total_courses: progress.length,
                        average_progress: avgProgress,
                        need_attention: progress.length === 0 || avgProgress < 30,
                    };
                });

                return { students: summary };
            }
        });

        // === POST /teacher/notify-student ===
        server.route({
            method: 'POST',
            path: '/teacher/notify-student',
            options: {
                tags: ['api', 'Teacher'],
                description: 'Kirim notifikasi ke satu student',
                pre: [verifyToken, requireRole('teacher')],
                validate: {
                    payload: Joi.object({
                        email: Joi.string().email().required(),
                        name: Joi.string().required(),
                        reason: Joi.string().required(),
                    }),
                },
            },
            handler: async (request, h) => {
                const { email, name, reason } = request.payload;

                try {
                    await sendStudentNotification(email, {
                        studentName: name,
                        message: reason
                    });

                    return { message: 'Notifikasi berhasil dikirim' };
                } catch (err) {
                    console.error(err);
                    return Boom.internal('Gagal kirim email');
                }
            }
        });

        // === POST /teacher/notify-bulk ===
        server.route({
            method: 'POST',
            path: '/teacher/notify-bulk',
            options: {
                tags: ['api', 'Teacher'],
                description: 'Kirim notifikasi ke semua student dalam class yang butuh perhatian',
                pre: [verifyToken, requireRole('teacher')],
                validate: {
                    payload: Joi.object({
                        reason: Joi.string().required(),
                    }),
                },
            },
            handler: async (request, h) => {
                const teacherId = request.auth.credentials.id;
                const { reason } = request.payload;

                // Ambil class_id
                const { data: teacher, error: teacherErr } = await db
                    .from('teacher_profiles')
                    .select('class_id')
                    .eq('user_id', teacherId)
                    .maybeSingle();

                if (teacherErr || !teacher || !teacher.class_id) {
                    return Boom.notFound('Teacher belum memiliki kelas');
                }

                const { data: students } = await db
                    .from('student_profiles')
                    .select('id, user_id, full_name')
                    .eq('class_id', teacher.class_id);

                const userIds = students.map(s => s.user_id);
                const studentIds = students.map(s => s.id);

                const { data: users } = await db
                    .from('users')
                    .select('id, email')
                    .in('id', userIds);

                const userMap = Object.fromEntries(users.map(u => [u.id, u.email]));

                const { data: progressList } = await db
                    .from('student_courses')
                    .select('student_id, course_id, checkpoint')
                    .in('student_id', studentIds);

                const courseIds = [...new Set(progressList.map(p => p.course_id))];

                const { data: sessionCounts } = await db
                    .from('course_sessions')
                    .select('course_id, count(*)')
                    .in('course_id', courseIds)
                    .group('course_id');

                const courseMap = Object.fromEntries(sessionCounts.map(item => [
                    item.course_id, parseInt(item.count)
                ]));

                const needNotify = [];

                for (const student of students) {
                    const email = userMap[student.user_id];
                    const studentCourses = progressList.filter(c => c.student_id === student.id);

                    const progress = studentCourses.map(course => {
                        const total = Math.max(courseMap[course.course_id] || 1, 1);
                        const percent = Math.min(100, Math.round((course.checkpoint / total) * 100));
                        return percent;
                    });

                    const avgProgress = progress.length
                        ? Math.round(progress.reduce((sum, p) => sum + p, 0) / progress.length)
                        : 0;

                    if (progress.length === 0 || avgProgress < 30) {
                        needNotify.push({ email, name: student.full_name });
                    }
                }

                let sent = 0;

                for (const s of needNotify) {
                    try {
                        await sendStudentNotification(s.email, {
                            studentName: s.name,
                            message: reason
                        });
                        sent++;
                    } catch (e) {
                        console.error(`Gagal kirim ke ${s.name}:`, e.message);
                    }
                }

                return {
                    message: `Notifikasi dikirim ke ${sent} siswa dari total ${needNotify.length}`
                };
            }
        });
    }
};
