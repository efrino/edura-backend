const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const { generateContentForTitle } = require('../utils/generate-content');
const { model } = require('../utils/geminiClient');
const supabase = require('../db');

function parseGeminiOutput(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const fullText = lines.join('\n');

    const titleMatch = fullText.match(/judul\s*[:\-]\s*(.+)/i);
    const descMatch = fullText.match(/deskripsi\s*[:\-]\s*(.+)/i);

    const title = titleMatch?.[1]?.trim() || lines[0];
    const description = descMatch?.[1]?.trim() || lines[1];

    const sessionRegex = /^\d+\.\s*(.+)$/gm;
    let match;
    const sessions = [];
    while ((match = sessionRegex.exec(fullText)) !== null && sessions.length < 16) {
        sessions.push({ title: match[1].trim() });
    }

    return {
        title: title || 'Course Tanpa Judul',
        description: description || 'Tidak ada deskripsi.',
        sessions
    };
}

module.exports = {
    name: 'course-routes',
    version: '1.0.0',
    register: async function (server) {
        server.route({
            method: 'POST',
            path: '/student/course/create',
            options: {
                tags: ['api', 'Course'],
                description: 'Create new course by student (auto generate or reuse)',
                pre: [verifyToken, requireRole('student')],
                validate: {
                    payload: Joi.object({
                        subject: Joi.string().required(),
                        level: Joi.string().valid('beginner', 'intermediate', 'expert').required()
                    })
                }
            },
            handler: async (request, h) => {
                const { subject, level } = request.payload;
                const userId = request.auth.credentials.id;

                console.log('[REQUEST] Create Course:', { userId, subject, level });

                const { data: profile, error: profileError } = await supabase
                    .from('student_profiles')
                    .select('program_studi')
                    .eq('user_id', userId)
                    .single();

                if (profileError || !profile)
                    return h.response({ message: 'Profil student tidak ditemukan' }).code(404);

                const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('plan')
                    .eq('id', userId)
                    .single();

                if (userError || !user)
                    return h.response({ message: 'User tidak ditemukan' }).code(404);

                const programStudi = profile.program_studi;
                const userPlan = user.plan || 'free';

                const { data: courseCountData, error: courseCountError } = await supabase
                    .from('student_courses')
                    .select('id', { count: 'exact', head: true })
                    .eq('student_id', userId);

                const courseCount = courseCountData || 0;
                if (userPlan === 'free' && courseCount >= 5)
                    return h.response({
                        message: 'Kamu sudah memiliki 5 course. Upgrade ke akun premium untuk menambah kuota.',
                        upgrade_required: true
                    }).code(403);

                const { data: pending } = await supabase
                    .from('courses')
                    .select('id')
                    .eq('created_by', userId)
                    .eq('is_generating', true)
                    .maybeSingle();

                if (pending)
                    return h.response({
                        message: 'Sedang ada course yang sedang digenerate. Silakan tunggu beberapa saat.',
                        course_id: pending.id
                    }).code(429);

                const { data: existingCourse } = await supabase
                    .from('courses')
                    .select('id')
                    .eq('subject', subject)
                    .eq('level', level)
                    .eq('program_studi', programStudi)
                    .maybeSingle();

                if (existingCourse) {
                    const { data: alreadyTaken } = await supabase
                        .from('student_courses')
                        .select('id')
                        .eq('student_id', userId)
                        .eq('course_id', existingCourse.id)
                        .maybeSingle();

                    if (!alreadyTaken) {
                        if (userPlan === 'free' && courseCount >= 5) {
                            return h.response({
                                message: 'Batas 5 course plan gratis sudah tercapai. Upgrade ke premium.',
                                upgrade_required: true
                            }).code(403);
                        }

                        const { error: insertError } = await supabase
                            .from('student_courses')
                            .insert({ student_id: userId, course_id: existingCourse.id });

                        if (insertError)
                            return h.response({ message: 'Gagal menyimpan ke student_courses' }).code(500);
                    }

                    return h.response({
                        message: 'Course sudah tersedia, kamu langsung masuk',
                        course_id: existingCourse.id,
                        reused: true
                    }).code(200);
                }

                // START GENERATE COURSE
                const prompt = `Buatkan course pembelajaran dengan level ${level} untuk program studi ${programStudi}.
Topik utama course adalah "${subject}". Formatkan output sebagai berikut:

Judul: <judul course>
Deskripsi: <deskripsi singkat course>

Berikut 16 pertemuan:
1. <judul pertemuan 1>
...
16. <judul pertemuan 16>`;

                let generated;
                try {
                    const result = await model.generateContent({ contents: [{ parts: [{ text: prompt }] }] });
                    const response = await result.response;
                    generated = response.text();
                } catch (err) {
                    console.error('Gemini error:', err);
                    return h.response({ message: 'Sedang banyak permintaan. Coba lagi dalam 1 menit.' }).code(429);
                }

                const parsed = parseGeminiOutput(generated);
                if (!parsed.title || parsed.sessions.length !== 16)
                    return h.response({
                        message: 'Output Gemini tidak valid. Harus 16 sesi dan ada judul.'
                    }).code(400);

                const { data: course, error: courseError } = await supabase
                    .from('courses')
                    .insert({
                        created_by: userId,
                        subject,
                        title: parsed.title,
                        description: parsed.description,
                        program_studi: programStudi,
                        level,
                        is_verified: false,
                        is_generating: true
                    })
                    .select()
                    .single();

                if (courseError)
                    return h.response({ message: 'Gagal menyimpan course' }).code(500);

                const courseId = course.id;
                const sessionsData = [];

                for (let i = 0; i < parsed.sessions.length; i++) {
                    const s = parsed.sessions[i];
                    try {
                        const contentObj = await generateContentForTitle(s.title);
                        console.log(`[SESSION ${i + 1}] ${s.title}:`, contentObj);

                        sessionsData.push({
                            course_id: courseId,
                            session_number: i + 1,
                            title: s.title || `Pertemuan ${i + 1}`,
                            content: contentObj
                        });
                    } catch (err) {
                        console.error('Gagal generate sesi:', s.title, err);
                        await supabase.from('courses').delete().eq('id', courseId);
                        return h.response({ message: 'Gagal generate sesi. Course dibatalkan.' }).code(500);
                    }
                }

                const { error: sessionError } = await supabase
                    .from('course_sessions')
                    .insert(sessionsData);

                if (sessionError) {
                    await supabase.from('courses').delete().eq('id', courseId);
                    return h.response({ message: 'Course gagal disimpan. Course dibatalkan.' }).code(500);
                }

                await supabase
                    .from('courses')
                    .update({ is_generating: false })
                    .eq('id', courseId);

                await supabase
                    .from('student_courses')
                    .insert({ student_id: userId, course_id: courseId });

                console.log('[SUCCESS] Course berhasil dibuat:', courseId);

                return h.response({
                    message: 'Course berhasil dibuat dan ditambahkan ke akunmu',
                    course_id: courseId,
                    reused: false
                }).code(201);
            }
        });
    }
};
