// worker/generate-sessions-worker.js
require('dotenv').config();
const supabase = require('../db');
const { generateContentForTitle } = require('../utils/generate-content');
const { logActivity } = require('../utils/logger');

async function fetchGeneratingCourses() {
    const { data, error } = await supabase
        .from('courses')
        .select('id, subject, program_studi, level')
        .eq('is_generating', true)
        .order('created_at', { ascending: true })
        .limit(3); // process max 3 at a time

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
            return; // stop on first failure for now
        }
    }

    const { error: finalizeError } = await supabase
        .from('courses')
        .update({ is_generating: false })
        .eq('id', course.id);

    if (!finalizeError) logActivity('WORKER_DONE', `Course selesai: ${course.id}`);
}

async function runWorker() {
    const courses = await fetchGeneratingCourses();

    for (const course of courses) {
        logActivity('WORKER_START', `Mulai proses course: ${course.id}`);
        await processCourse(course);
    }

    console.log(`[${new Date().toISOString()}] Worker selesai.`);
    process.exit(0);
}

runWorker();
