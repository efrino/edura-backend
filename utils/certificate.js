//utils/certificate.js

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

/**
 * Generate a PDF certificate using Puppeteer and HTML template
 * @param {Object} data - Certificate data
 * @param {string} data.fullName - Student's full name
 * @param {string} data.courseTitle - Course title
 * @param {string} data.teacherName - Teacher's full name (from teacher_profiles)
 * @param {string|number} data.score - Final score of the student
 */
async function generateCertificate({ fullName, courseTitle, teacherName, score }) {
    const templatePath = path.join(__dirname, 'template.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    const now = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    html = html
        .replace('{{FULL_NAME}}', fullName)
        .replace('{{COURSE_TITLE}}', courseTitle)
        .replace('{{TEACHER_NAME}}', teacherName || 'Unknown')
        .replace('{{FINAL_SCORE}}', score ?? 'N/A')
        .replace('{{YEAR}}', now.getFullYear())
        .replace('{{DATE}}', formattedDate);


    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const buffer = await page.pdf({
        format: 'A4',
        printBackground: true
    });

    await browser.close();
    return buffer;
}

module.exports = { generateCertificate };
