const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const { model } = require('../utils/geminiClient');
const supabase = require('../db');

function parseGeminiOutput(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    const titleLine = lines.find(l => /^judul\s*[:\-]/i.test(l));
    const descLine = lines.find(l => /^deskripsi\s*[:\-]/i.test(l));

    const title = titleLine?.split(/[:\-]/)[1]?.trim();
    const description = descLine?.split(/[:\-]/)[1]?.trim();

    const sessionLines = lines.filter(l => /^\d+\./.test(l));
    const sessions = sessionLines.map(line => ({
        title: line.replace(/^\d+\.\s*/, '').trim(),
        content: '-'
    }));

    return { title, description, sessions };
}


module.exports = {
    name: 'course-routes',
    version: '1.0.0',
    register: async function (server, options) {
        server.route({
            method: 'POST',
            path: '/create-course',
            options: {
                tags: ['api', 'Course'],
                description: 'Create new course by student (auto generate or reuse)',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    payload: Joi.object({
                        subject: Joi.string().required().label('Mau belajar apa?'),
                        level: Joi.string().valid('beginner', 'intermediate', 'expert').required()
                    })
                }
            },
            handler: async (request, h) => {
                const { subject, level } = request.payload;
                const userId = request.auth.credentials.id;

                // Ambil program studi dari profil student
                const { data: profile, error: profileError } = await supabase
                    .from('student_profiles')
                    .select('program_studi')
                    .eq('user_id', userId)
                    .single();

                if (profileError || !profile) {
                    return h.response({ message: 'Profil student tidak ditemukan' }).code(404);
                }

                const programStudi = profile.program_studi;

                // Cek apakah course sudah ada
                const { data: existingCourse, error: fetchError } = await supabase
                    .from('courses')
                    .select('id, title')
                    .eq('subject', subject)
                    .eq('level', level)
                    .eq('program_studi', programStudi)
                    .maybeSingle();

                if (fetchError) {
                    console.error(fetchError);
                    return h.response({ message: 'Gagal cek course di database' }).code(500);
                }

                if (existingCourse) {
                    return h.response({
                        message: 'Course sudah tersedia di database',
                        course_id: existingCourse.id,
                        reused: true
                    }).code(200);
                }

                // Generate course via Gemini API
                const prompt = `Buatkan course pembelajaran dengan level ${level} untuk program studi ${programStudi}.
Topik utama course adalah "${subject}". Formatkan output sebagai berikut:

Judul: <judul course>
Deskripsi: <deskripsi singkat course>

Berikut 16 pertemuan:
1. <judul pertemuan 1>
2. <judul pertemuan 2>
...
16. <judul pertemuan 16>

Jangan tambahkan teks lain selain format di atas.`;


                let generated;
                try {
                    const result = await model.generateContent({
                        contents: [{ parts: [{ text: prompt }] }]
                    });
                    const response = await result.response;
                    generated = response.text();
                } catch (err) {
                    console.error('Gemini error:', err);
                    return h.response({ message: 'Gagal generate course dari Gemini' }).code(500);
                }
                console.log('=== Gemini Output ===');
                console.log(generated);

                const parsed = parseGeminiOutput(generated);
                if (!parsed.title || parsed.sessions.length !== 16) {
                    return h.response({ message: 'Output Gemini tidak valid (judul atau jumlah sesi tidak sesuai)' }).code(400);
                }

                // Simpan course baru
                const { data: course, error: courseError } = await supabase
                    .from('courses')
                    .insert({
                        created_by: userId,
                        subject,
                        title: parsed.title,
                        description: parsed.description,
                        program_studi: programStudi,
                        level
                    })
                    .select()
                    .single();

                if (courseError) {
                    console.error(courseError);
                    return h.response({ message: 'Gagal menyimpan course' }).code(500);
                }

                // Simpan sesi-sesi course
                const sessionsData = parsed.sessions.map((s, i) => ({
                    course_id: course.id,
                    session_number: i + 1,
                    title: s.title,
                    content: s.content,
                }));

                const { error: sessionsError } = await supabase
                    .from('course_sessions')
                    .insert(sessionsData);

                if (sessionsError) {
                    console.error(sessionsError);
                    return h.response({ message: 'Course berhasil dibuat, tapi gagal simpan sesi' }).code(500);
                }

                return h.response({
                    message: 'Course berhasil dibuat',
                    course_id: course.id,
                    reused: false
                }).code(201);
            }
        });
    }
};
