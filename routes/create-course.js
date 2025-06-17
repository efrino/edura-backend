const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const { model } = require('../utils/geminiClient');
const supabase = require('../db');

// Fungsi generate konten per sesi
async function generateContentForTitle(title) {
    const prompt = `Buatkan konten pembelajaran untuk sesi berjudul "${title}".
Berikan daftar langkah-langkah atau poin pembelajaran dalam format JSON.
Contoh format output:
{
  "overview": "<penjelasan singkat>",
  "steps": ["Langkah 1", "Langkah 2"]
}`;
    try {
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }]
        });
        const response = await result.response;
        const text = response.text().trim();
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('Tidak ditemukan blok JSON');
        const cleanJson = text.slice(jsonStart, jsonEnd + 1);
        try {
            const parsed = JSON.parse(cleanJson);
            return typeof parsed === 'object' && parsed !== null ? parsed : { overview: '-', steps: [] };
        } catch {
            return { overview: '-', steps: [] };
        }
    } catch (err) {
        console.error('Gagal generate content sesi:', title, err);
        return { overview: '-', steps: [] };
    }
}

// Parsing output dari Gemini
function parseGeminiOutput(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    const titleLine = lines.find(l => /^judul\s*[:\-]/i.test(l));
    const descLine = lines.find(l => /^deskripsi\s*[:\-]/i.test(l));
    const title = titleLine?.split(/[:\-]/)[1]?.trim() || 'Course Tanpa Judul';
    const description = descLine?.split(/[:\-]/)[1]?.trim() || 'Tidak ada deskripsi.';

    const sessionLines = lines.filter(l => /^\d+\./.test(l)).slice(0, 16);

    if (sessionLines.length < 16) {
        return { title: null, description: null, sessions: [] };
    }

    const sessions = sessionLines.map(line => ({
        title: line.replace(/^\d+\.\s*/, '').trim(),
        content: {}
    }));

    return { title, description, sessions };
}

module.exports = {
    name: 'course-routes',
    version: '1.0.0',
    register: async function (server, options) {
        server.route({
            method: 'POST',
            path: '/student/course/create',
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

                const { data: profile, error: profileError } = await supabase
                    .from('student_profiles')
                    .select('program_studi')
                    .eq('user_id', userId)
                    .single();

                const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('plan')
                    .eq('id', userId)
                    .single();

                if (profileError || !profile) {
                    return h.response({ message: 'Profil student tidak ditemukan' }).code(404);
                }

                if (userError || !user) {
                    return h.response({ message: 'User tidak ditemukan' }).code(404);
                }

                const programStudi = profile.program_studi;
                const userPlan = user.plan || 'free';

                if (userPlan === 'free') {
                    const { count, error: countError } = await supabase
                        .from('student_courses')
                        .select('id', { count: 'exact', head: true })
                        .eq('student_id', userId);

                    if (countError) {
                        console.error('Gagal cek kuota course:', countError);
                        return h.response({ message: 'Gagal memverifikasi kuota course' }).code(500);
                    }

                    if (count >= 5) {
                        return h.response({
                            message: 'Kamu sudah memiliki 5 course. Upgrade ke akun premium untuk menambah kuota.',
                            upgrade_required: true
                        }).code(403);
                    }
                }

                const { data: existingCourse, error: fetchError } = await supabase
                    .from('courses')
                    .select('id')
                    .eq('subject', subject)
                    .eq('level', level)
                    .eq('program_studi', programStudi)
                    .maybeSingle();

                let courseId;

                if (fetchError) {
                    console.error(fetchError);
                    return h.response({ message: 'Gagal cek course di database' }).code(500);
                }

                if (existingCourse) {
                    courseId = existingCourse.id;
                } else {
                    const prompt = `Buatkan course pembelajaran dengan level ${level} untuk program studi ${programStudi}.
Topik utama course adalah "${subject}". Formatkan output sebagai berikut:

Judul: <judul course>
Deskripsi: <deskripsi singkat course>

Berikut 16 pertemuan:
1. <judul pertemuan 1>
2. <judul pertemuan 2>
...
16. <judul pertemuan 16>`;

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

                    const parsed = parseGeminiOutput(generated);
                    if (!parsed.title || parsed.sessions.length !== 16) {
                        console.warn('Gemini output:\n', generated);
                        return h.response({
                            message: 'Output Gemini tidak valid. Pastikan subject dan level spesifik.',
                            error: 'Parsing gagal: jumlah sesi harus 16 dan harus ada judul.'
                        }).code(400);
                    }

                    for (let i = 0; i < parsed.sessions.length; i++) {
                        const contentObj = await generateContentForTitle(parsed.sessions[i].title);
                        parsed.sessions[i].content = JSON.stringify(contentObj);
                    }

                    const { data: course, error: courseError } = await supabase
                        .from('courses')
                        .insert({
                            created_by: userId,
                            subject,
                            title: parsed.title,
                            description: parsed.description,
                            program_studi: programStudi,
                            level,
                            is_verified: false
                        })
                        .select()
                        .single();

                    if (courseError) {
                        console.error(courseError);
                        return h.response({ message: 'Gagal menyimpan course' }).code(500);
                    }

                    courseId = course.id;

                    const sessionsData = parsed.sessions.map((s, i) => ({
                        course_id: courseId,
                        session_number: i + 1,
                        title: s.title,
                        content: s.content
                    }));

                    const { error: sessionsError } = await supabase
                        .from('course_sessions')
                        .insert(sessionsData);

                    if (sessionsError) {
                        console.error(sessionsError);
                        return h.response({ message: 'Course berhasil dibuat, tapi gagal simpan sesi' }).code(500);
                    }
                }

                const { data: checkStudentCourse } = await supabase
                    .from('student_courses')
                    .select('id')
                    .eq('student_id', userId)
                    .eq('course_id', courseId)
                    .maybeSingle();

                if (!checkStudentCourse) {
                    const { error: scError } = await supabase
                        .from('student_courses')
                        .insert({ student_id: userId, course_id: courseId });

                    if (scError) {
                        console.error(scError);
                        return h.response({ message: 'Gagal menyimpan ke student_courses' }).code(500);
                    }
                }

                return h.response({
                    message: existingCourse
                        ? 'Course sudah tersedia, kamu langsung masuk'
                        : 'Course berhasil dibuat dan ditambahkan ke akunmu',
                    course_id: courseId,
                    reused: !!existingCourse
                }).code(existingCourse ? 200 : 201);
            }
        });
    }
};
