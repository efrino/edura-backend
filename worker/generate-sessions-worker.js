// // // worker/generate-sessions-worker.js
// // require('dotenv').config();
// // const supabase = require('../db');
// // const { generateContentForTitle } = require('../utils/generate-content');
// // const { logActivity } = require('../utils/logger');

// // async function fetchGeneratingCourses() {
// //     const { data, error } = await supabase
// //         .from('courses')
// //         .select('id, subject, program_studi, level')
// //         .eq('is_generating', true)
// //         .order('created_at', { ascending: true })
// //         .limit(3); // process max 3 at a time

// //     if (error) {
// //         console.error('[WORKER_ERROR] Fetching courses:', error.message);
// //         return [];
// //     }
// //     return data;
// // }

// // async function fetchSessions(course_id) {
// //     const { data, error } = await supabase
// //         .from('course_sessions')
// //         .select('*')
// //         .eq('course_id', course_id)
// //         .is('content', null);

// //     if (error) {
// //         console.error(`[WORKER_ERROR] Fetching sessions: ${course_id}`, error.message);
// //         return [];
// //     }
// //     return data;
// // }

// // async function processCourse(course) {
// //     const sessions = await fetchSessions(course.id);

// //     for (const session of sessions) {
// //         try {
// //             const content = await generateContentForTitle(session.title);

// //             const { error: updateError } = await supabase
// //                 .from('course_sessions')
// //                 .update({ content })
// //                 .eq('id', session.id);

// //             if (updateError) throw updateError;

// //             logActivity('WORKER_SESSION_DONE', `Sesi ${session.session_number} selesai: ${session.title}`);
// //             await new Promise((res) => setTimeout(res, 1200)); // avoid rate-limit
// //         } catch (err) {
// //             console.error(`[WORKER_FAIL] ${course.id} - ${session.title}`, err.message);
// //             return; // stop on first failure for now
// //         }
// //     }

// //     const { error: finalizeError } = await supabase
// //         .from('courses')
// //         .update({ is_generating: false })
// //         .eq('id', course.id);

// //     if (!finalizeError) logActivity('WORKER_DONE', `Course selesai: ${course.id}`);
// // }

// // async function runWorker() {
// //     const courses = await fetchGeneratingCourses();

// //     for (const course of courses) {
// //         logActivity('WORKER_START', `Mulai proses course: ${course.id}`);
// //         await processCourse(course);
// //     }

// //     console.log(`[${new Date().toISOString()}] Worker selesai.`);
// //     process.exit(0);
// // }

// // runWorker();
// // worker/generate-sessions-worker.js
// require('dotenv').config();
// const supabase = require('../db');
// const { generateContentForTitle } = require('../utils/generate-content');
// const { logActivity } = require('../utils/logger');

// async function fetchGeneratingCourses() {
//     const { data, error } = await supabase
//         .from('courses')
//         .select('id, subject, program_studi, level')
//         .eq('is_generating', true)
//         .order('created_at', { ascending: true })
//         .limit(3);

//     if (error) {
//         console.error('[WORKER_ERROR] Fetching courses:', error.message);
//         return [];
//     }
//     return data;
// }

// async function fetchSessions(course_id) {
//     const { data, error } = await supabase
//         .from('course_sessions')
//         .select('*')
//         .eq('course_id', course_id)
//         .is('content', null);

//     if (error) {
//         console.error(`[WORKER_ERROR] Fetching sessions: ${course_id}`, error.message);
//         return [];
//     }
//     return data;
// }

// async function processCourse(course) {
//     const sessions = await fetchSessions(course.id);

//     for (const session of sessions) {
//         try {
//             const content = await generateContentForTitle(session.title);

//             const { error: updateError } = await supabase
//                 .from('course_sessions')
//                 .update({ content })
//                 .eq('id', session.id);

//             if (updateError) throw updateError;

//             logActivity('WORKER_SESSION_DONE', `Sesi ${session.session_number} selesai: ${session.title}`);
//             await new Promise((res) => setTimeout(res, 1200)); // avoid rate-limit
//         } catch (err) {
//             console.error(`[WORKER_FAIL] ${course.id} - ${session.title}`, err.message);
//             return;
//         }
//     }

//     const { error: finalizeError } = await supabase
//         .from('courses')
//         .update({ is_generating: false })
//         .eq('id', course.id);

//     if (!finalizeError) logActivity('WORKER_DONE', `Course selesai: ${course.id}`);
// }

// async function runWorker() {
//     const courses = await fetchGeneratingCourses();

//     for (const course of courses) {
//         logActivity('WORKER_START', `Mulai proses course: ${course.id}`);
//         await processCourse(course);
//     }

//     console.log(`[${new Date().toISOString()}] Worker selesai.`);
// }

// // ⬇️ Export sebagai fungsi, agar bisa dipanggil dari mana saja
// module.exports = runWorker;
require('dotenv').config();
const cron = require('node-cron');
const supabase = require('../db');
const { generateContentForTitle } = require('../utils/generate-content');
const { logActivity } = require('../utils/logger');

// KUNCI (LOCK): Mencegah worker berjalan ganda
let isWorkerRunning = false;

async function fetchGeneratingCourses() {
    const { data, error } = await supabase
        .from('courses')
        .select('id, subject, program_studi, level')
        .eq('is_generating', true)
        .order('created_at', { ascending: true })
        .limit(3);

    if (error) {
        console.error('[WORKER_ERROR] Fetching courses:', error.message);
        return [];
    }
    return data;
}

async function fetchSessions(course_id) {
    const { data, error } = await supabase
        .from('course_sessions')
        .select('*')
        .eq('course_id', course_id)
        .is('content', null);

    if (error) {
        console.error(`[WORKER_ERROR] Fetching sessions: ${course_id}`, error.message);
        return [];
    }
    return data;
}

async function processCourse(course) {
    const sessions = await fetchSessions(course.id);

    for (const session of sessions) {
        try {
            const content = await generateContentForTitle(session.title);

            const { error: updateError } = await supabase
                .from('course_sessions')
                .update({ content })
                .eq('id', session.id);

            if (updateError) throw updateError;

            logActivity('WORKER_SESSION_DONE', `Sesi ${session.session_number} selesai: ${session.title}`);
            await new Promise((res) => setTimeout(res, 1200)); // avoid rate-limit
        } catch (err) {
            console.error(`[WORKER_FAIL] ${course.id} - ${session.title}`, err.message);
            // Lanjutkan ke sesi berikutnya meskipun ada error di satu sesi
        }
    }

    const { error: finalizeError } = await supabase
        .from('courses')
        .update({ is_generating: false })
        .eq('id', course.id);

    if (!finalizeError) {
        logActivity('WORKER_DONE', `Course selesai: ${course.id}`);
    } else {
        console.error(`[WORKER_ERROR] Gagal memfinalisasi course ${course.id}:`, finalizeError.message);
    }
}

async function runWorker() {
    // 1. Cek apakah ada worker lain yang sedang berjalan (Concurrency Lock)
    if (isWorkerRunning) {
        console.log(`[${new Date().toISOString()}] Cron job diabaikan karena proses sebelumnya masih berjalan.`);
        return;
    }

    // 2. Kunci proses agar tidak ada worker baru yang masuk
    isWorkerRunning = true;
    console.log(`[${new Date().toISOString()}] Worker dimulai oleh cron job...`);

    try {
        const courses = await fetchGeneratingCourses();

        // Hanya jalankan proses jika ada course yang perlu digenerate
        if (courses.length > 0) {
            for (const course of courses) {
                logActivity('WORKER_START', `Mulai proses course: ${course.id}`);
                await processCourse(course);
            }
        } else {
            console.log(`[${new Date().toISOString()}] Tidak ada course yang perlu diproses saat ini.`);
        }

    } catch (err) {
        console.error(`[${new Date().toISOString()}] Terjadi error pada worker:`, err.message);
    } finally {
        // 3. Lepaskan kunci setelah selesai (baik sukses maupun gagal)
        isWorkerRunning = false;
        console.log(`[${new Date().toISOString()}] Proses worker selesai. Kunci dilepaskan.`);
    }
}

// --- PENJADWALAN NODE-CRON ---
// Jadwalkan fungsi runWorker untuk berjalan setiap 1 menit.
cron.schedule('*/1 * * * *', () => {
    runWorker();
});

console.log('✅ Worker generate-sessions telah dijadwalkan.');
console.log('   Proses akan berjalan setiap menit untuk memeriksa pekerjaan baru.');
console.log('   Tekan CTRL+C untuk menghentikan worker.');
