const Joi = require('joi');
const { verifyToken, requireRole } = require('../utils/middleware');
const { generateContentForTitle } = require('../utils/generate-content');
const { getNextModel } = require('../utils/geminiClient');
const { logActivity } = require('../utils/logger');
const supabase = require('../db');
const stringSimilarity = require('string-similarity');
const { normalizeSubject } = require('../utils/normalize');

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

                logActivity('COURSE_REQUEST', `Create Course: ${userId}, ${subject}, ${level}`);

                const { data: profile, error: profileError } = await supabase
                    .from('student_profiles')
                    .select('program_studi')
                    .eq('user_id', userId)
                    .single();
                if (profileError || !profile) return h.response({ message: 'Profil student tidak ditemukan' }).code(404);

                const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('plan')
                    .eq('id', userId)
                    .single();
                if (userError || !user) return h.response({ message: 'User tidak ditemukan' }).code(404);

                const userPlan = user.plan || 'free';
                const programStudi = profile.program_studi;

                const { count: courseCount } = await supabase
                    .from('student_courses')
                    .select('*', { count: 'exact', head: true })
                    .eq('student_id', userId);

                if (userPlan === 'free' && courseCount >= 5) {
                    return h.response({
                        message: 'Kamu sudah memiliki 5 course. Upgrade ke akun premium untuk menambah kuota.',
                        upgrade_required: true,
                    }).code(403);
                }

                const { data: pending } = await supabase
                    .from('courses')
                    .select('id')
                    .eq('created_by', userId)
                    .eq('is_generating', true)
                    .maybeSingle();
                if (pending) return h.response({ message: 'Course sedang digenerate.', course_id: pending.id }).code(429);

                // === Normalisasi & cek kemiripan subject ===
                const normalizedInput = normalizeSubject(subject);
                const { data: similarCourses } = await supabase
                    .from('courses')
                    .select('id, subject')
                    .eq('program_studi', programStudi)
                    .eq('level', level);

                if (similarCourses && similarCourses.length > 0) {
                    const matches = similarCourses.map((course) => ({
                        id: course.id,
                        subject: course.subject,
                        similarity: stringSimilarity.compareTwoStrings(
                            normalizeSubject(course.subject),
                            normalizedInput
                        ),
                    }));

                    matches.sort((a, b) => b.similarity - a.similarity);

                    if (matches[0].similarity >= 0.75) {
                        const reusedCourse = matches[0];
                        const { data: taken } = await supabase
                            .from('student_courses')
                            .select('id')
                            .eq('student_id', userId)
                            .eq('course_id', reusedCourse.id)
                            .maybeSingle();

                        if (!taken) {
                            await supabase.from('student_courses').insert({
                                student_id: userId,
                                course_id: reusedCourse.id,
                            });
                        }

                        return h.response({
                            message: `Course dengan topik serupa "${reusedCourse.subject}" sudah tersedia, kamu langsung masuk.`,
                            course_id: reusedCourse.id,
                            reused: true,
                        }).code(200);
                    }
                }

                // === GENERATE PROMPT (tanpa generate konten langsung) ===
                const prompt = `Kamu adalah AI pengajar profesional untuk mahasiswa program studi ${programStudi}.

Buatkan satu course pembelajaran **tingkat ${level}** dengan topik utama "${subject}", dalam format struktur sebagai berikut dan *jangan menambahkan penjelasan tambahan*:

Judul: <judul course>
Deskripsi: <deskripsi singkat course>

1. <judul sesi 1>
2. <judul sesi 2>
3. <judul sesi 3>
4. <judul sesi 4>
5. <judul sesi 5>
6. <judul sesi 6>
7. <judul sesi 7>
8. <judul sesi 8>
9. <judul sesi 9>
10. <judul sesi 10>
11. <judul sesi 11>
12. <judul sesi 12>
13. <judul sesi 13>
14. <judul sesi 14>
15. <judul sesi 15>
16. <judul sesi 16>`;


                let generated;
                let success = false;
                let lastError;

                for (let i = 0; i < 4; i++) {
                    try {
                        const model = getNextModel();
                        const result = await model.generateContent({ contents: [{ parts: [{ text: prompt }] }] });
                        generated = result.response.text();
                        success = true;
                        break;
                    } catch (err) {
                        lastError = err;
                        logActivity('GEMINI_RETRY', `Try ${i + 1}: ${err.message}`);
                    }
                }

                if (!success) {
                    logActivity('GEMINI_FAIL', lastError.message);
                    return h.response({ message: 'Semua API Gemini overload. Coba lagi nanti.' }).code(429);
                }

                const parsed = parseGeminiOutput(generated);
                if (!parsed.title || parsed.sessions.length !== 16) {
                    return h.response({ message: 'Output Gemini tidak valid. Harus ada 16 sesi dan judul.' }).code(400);
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
                        is_verified: false,
                        is_generating: true,
                    })
                    .select()
                    .single();

                if (courseError) return h.response({ message: 'Gagal menyimpan course' }).code(500);

                const { error: insertStudentCourseError } = await supabase
                    .from('student_courses')
                    .insert({
                        student_id: userId,
                        course_id: course.id,
                    });

                if (insertStudentCourseError) {
                    await supabase.from('courses').delete().eq('id', course.id);
                    return h.response({ message: 'Gagal menyimpan progress student' }).code(500);
                }

                // === Insert sesi kosong tanpa content ===
                const sessionPayloads = parsed.sessions.map((session, index) => ({
                    course_id: course.id,
                    session_number: index + 1,
                    title: session.title,
                    content: null,
                }));

                const { error: sessionInsertError } = await supabase.from('course_sessions').insert(sessionPayloads);
                if (sessionInsertError) {
                    await supabase.from('courses').delete().eq('id', course.id);
                    return h.response({ message: 'Gagal menyimpan sesi awal. Course dibatalkan.' }).code(500);
                }

                logActivity('COURSE_SUCCESS', `Course created (awaiting content): ${course.id}`);

                return h.response({
                    message: 'Course berhasil dibuat dan akan digenerate dalam beberapa menit.',
                    course_id: course.id,
                    reused: false,
                }).code(201);
            }
        });
    }
};
