const nodemailer = require('nodemailer');
const { getEnv } = require('./env');
const db = require('../db'); // ⬅️ WAJIB ADA

let transporter = null;
let defaultFrom = null;

async function getTransporter() {
    if (transporter) return transporter;

    const [host, port, secure, user, pass] = await Promise.all([
        getEnv('MAIL_HOST'),
        getEnv('MAIL_PORT'),
        getEnv('MAIL_SECURE'),
        getEnv('MAIL_USER'),
        getEnv('MAIL_PASS')
    ]);

    defaultFrom = `"Edura App" <${user}>`;

    transporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: secure === true || secure === 'true',
        auth: { user, pass }
    });

    return transporter;
}

function emailLayout({ title, body }) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 8px;">
      <div style="background-color: #1e90ff; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0;">${title}</h2>
      </div>
      <div style="padding: 30px; font-size: 16px; color: #333;">
        ${body}
        <p style="margin-top: 30px;">Thanks,<br><strong>Edura Team</strong></p>
      </div>
      <div style="background-color: #f5f5f5; text-align: center; font-size: 12px; padding: 10px; color: #777;">
        © ${new Date().getFullYear()} Edura Platform. All rights reserved.
      </div>
    </div>`;
}

async function sendEmail({ to, subject, html, attachments }) {
    const mailer = await getTransporter();
    await mailer.sendMail({
        from: defaultFrom,
        to,
        subject,
        html,
        attachments
    });
}

async function sendMagicLinkEmail(to, token) {
    const frontendUrl = await getEnv('FRONTEND_BASE_URL');
    const link = `${frontendUrl}#/verify-email?token=${token}`;
    const html = emailLayout({
        title: 'Verify Your Email Address',
        body: `
            <p>Hello,</p>
            <p>Click the button below to verify your email address:</p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${link}" style="background-color: #1e90ff; color: white; padding: 12px 20px; border-radius: 5px; text-decoration: none;">Verify Email</a>
            </div>
            <p>If the button above doesn't work, copy and paste this URL:</p>
            <code style="background-color: #f0f0f0; padding: 8px;">${link}</code>
        `
    });

    await sendEmail({ to, subject: 'Verify Your Email Address', html });
}

async function sendOtpEmail(to, otp) {
    const html = emailLayout({
        title: 'Your OTP Code',
        body: `
            <p>Hello,</p>
            <p>Use this code to login:</p>
            <div style="text-align: center; margin: 20px 0;">
              <span style="font-size: 28px; letter-spacing: 5px; font-weight: bold; color: #1e90ff;">${otp}</span>
            </div>
            <p>This code will expire in <strong>5 minutes</strong>.</p>
        `
    });

    await sendEmail({ to, subject: 'Your Login OTP Code', html });
}

async function sendPasswordResetLink(to, token) {
    const frontendUrl = await getEnv('FRONTEND_BASE_URL');
    const link = `${frontendUrl}#/reset-password?token=${token}`;
    const html = emailLayout({
        title: 'Reset Your Password',
        body: `
            <p>Hello,</p>
            <p>Click below to reset your Edura password:</p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${link}" style="background-color: #e67e22; color: white; padding: 12px 20px; border-radius: 5px;">Reset Password</a>
            </div>
            <p>If the button above doesn't work:</p>
            <code style="background-color: #f0f0f0; padding: 8px;">${link}</code>
            <p>This link will expire in <strong>1 hour</strong>.</p>
        `
    });

    await sendEmail({ to, subject: 'Reset Your Edura Password', html });
}

async function sendStudentNotification(to, { studentName, message, course_id }) {
    const frontendUrl = await getEnv('FRONTEND_BASE_URL');

    let courseTitle = 'a course in Edura';
    if (course_id) {
        try {
            const { data } = await db
                .from('courses')
                .select('title')
                .eq('id', course_id)
                .maybeSingle();

            if (data?.title) courseTitle = `"${data.title}"`;
        } catch (e) {
            console.warn('⚠️ Gagal mengambil course title, fallback ke default.');
        }
    }

    const html = emailLayout({
        title: 'Reminder from Your Teacher',
        body: `
            <p>Dear <strong>${studentName}</strong>,</p>
            <p>Course : <strong>${courseTitle}</strong>.</p>
            <p><strong>Notes : </strong> <i>${message}</i></p>
            <p>Check your progress at <a href="${frontendUrl}">Edura LMS</a>.</p>
        `
    });

    await sendEmail({ to, subject: `Reminder: ${courseTitle}`, html });
}

async function sendCertificateEmail(to, pdfBuffer) {
    const html = emailLayout({
        title: 'Sertifikat Penyelesaian Course',
        body: `
            <p>Selamat! Anda telah menyelesaikan course di Edura Platform.</p>
            <p>Sertifikat terlampir dalam email ini.</p>
        `
    });

    await sendEmail({
        to,
        subject: 'Sertifikat Course Anda',
        html,
        attachments: [
            {
                filename: 'sertifikat-edura.pdf',
                content: pdfBuffer
            }
        ]
    });
}

async function sendPaymentStatusEmail(to, { userName, status, amount }) {
    let title = '';
    let body = '';

    if (status === 'settlement' || status === 'capture') {
        title = 'Pembayaran Berhasil';
        body = `
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Terima kasih telah melakukan pembayaran sebesar <strong>Rp ${amount.toLocaleString()}</strong>.</p>
            <p>Akun kamu telah di-upgrade ke <strong>Premium</strong>. Nikmati fitur eksklusif di Edura Platform.</p>
        `;
    } else if (status === 'pending') {
        title = 'Pembayaran Tertunda';
        body = `
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Pembayaran kamu sedang diproses. Kami akan kirimkan notifikasi setelah berhasil.</p>
        `;
    } else {
        title = 'Pembayaran Gagal';
        body = `
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Maaf, pembayaran kamu sebesar <strong>Rp ${amount.toLocaleString()}</strong> gagal diproses.</p>
            <p>Silakan coba lagi atau hubungi kami jika ada kendala.</p>
        `;
    }

    const html = emailLayout({ title, body });
    await sendEmail({ to, subject: title, html });
}
async function sendTeacherRequestStatusEmail(to, { fullName, status }) {
    let title = 'Pengajuan Akun Dosen Anda';
    let body = '';

    if (status === 'pending') {
        body = `
            <p>Halo <strong>${fullName}</strong>,</p>
            <p>Pengajuan Anda sebagai dosen telah diterima dan sedang kami tinjau.</p>
            <p>Kami akan menghubungi Anda kembali setelah proses verifikasi selesai.</p>
        `;
    } else if (status === 'approved') {
        body = `
            <p>Halo <strong>${fullName}</strong>,</p>
            <p>Selamat! Pengajuan Anda sebagai dosen di Edura telah <strong>disetujui</strong>.</p>
            <p>Anda sekarang memiliki akses penuh ke fitur dosen di platform kami.</p>
        `;
    } else if (status === 'rejected') {
        body = `
            <p>Halo <strong>${fullName}</strong>,</p>
            <p>Mohon maaf, pengajuan Anda sebagai dosen telah <strong>ditolak</strong>.</p>
            <p>Silakan hubungi admin untuk informasi lebih lanjut.</p>
        `;
    }

    const html = emailLayout({ title, body });
    await sendEmail({ to, subject: title, html });
}

module.exports = {
    sendMagicLinkEmail,
    sendOtpEmail,
    sendPasswordResetLink,
    sendStudentNotification,
    sendCertificateEmail,
    sendPaymentStatusEmail,
    sendTeacherRequestStatusEmail
};
