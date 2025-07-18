const Joi = require('joi');
const Boom = require('@hapi/boom');
const db = require('../db');
const { verifyToken, requireRole } = require('../utils/middleware');
const { generateCertificate } = require('../utils/certificate');
const { sendCertificateEmail } = require('../utils/email');

module.exports = {
    name: 'teacher-certificate',
    version: '1.0.0',
    register: async function (server) {
        server.route({
            method: 'POST',
            path: '/teacher/send-certificate',
            options: {
                tags: ['api', 'Teacher'],
                description: 'Guru mengirim sertifikat untuk siswa',
                pre: [verifyToken, requireRole('teacher')],
                validate: {
                    payload: Joi.object({
                        student_id: Joi.string().uuid().required(),
                        course_id: Joi.string().uuid().required(),
                        class_id: Joi.string().uuid().required()
                    })
                }
            },
            handler: async (req, h) => {
                const { student_id, course_id, class_id } = req.payload;

                try {
                    // Ambil data course
                    const { data: course, error: courseErr } = await db
                        .from('courses')
                        .select('title')
                        .eq('id', course_id)
                        .maybeSingle();
                    if (courseErr || !course) throw Boom.notFound('Course tidak ditemukan');

                    // Ambil data guru dari class
                    const { data: classData, error: classErr } = await db
                        .from('classes')
                        .select('teacher_id')
                        .eq('id', class_id)
                        .maybeSingle();
                    if (classErr || !classData?.teacher_id) throw Boom.notFound('Kelas atau guru tidak ditemukan');

                    // Ambil nama guru
                    const { data: teacherProfile } = await db
                        .from('teacher_profiles')
                        .select('full_name')
                        .eq('user_id', classData.teacher_id)
                        .maybeSingle();
                    const teacherName = teacherProfile?.full_name || 'Unknown';

                    // Ambil nama & email siswa
                    const { data: studentProfile, error: studentProfileErr } = await db
                        .from('student_profiles')
                        .select('user_id, full_name, users(email)')
                        .eq('id', student_id)
                        .maybeSingle();
                    if (studentProfileErr || !studentProfile) throw Boom.notFound('Student tidak ditemukan');

                    const fullName = studentProfile.full_name;
                    const email = studentProfile.users?.email;

                    // Ambil nilai dari final exam result
                    const { data: examResult, error: examErr } = await db
                        .from('student_finalexam_results')
                        .select('score')
                        .eq('course_id', course_id)
                        .eq('student_id', studentProfile.user_id)
                        .maybeSingle();
                    if (examErr || !examResult) throw Boom.notFound('Belum ada hasil final exam siswa tersebut');

                    // Generate sertifikat
                    const pdfBuffer = await generateCertificate({
                        fullName,
                        courseTitle: course.title,
                        teacherName,
                        score: examResult.score,
                        year: new Date().getFullYear()
                    });

                    await sendCertificateEmail(email, pdfBuffer);

                    return h.response({ message: '✅ Sertifikat berhasil dikirim ke email siswa.' });
                } catch (err) {
                    console.error('🔥 Gagal membuat/kirim sertifikat:', err);
                    return Boom.internal('Gagal membuat atau mengirim sertifikat');
                }
            }
        });
    }
};
