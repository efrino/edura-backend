const nodemailer = require('nodemailer');
const { getEnv } = require('./env');
const db = require('../db');

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
// This is the main, reusable email sending function.
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
function emailLayout({ title, body, backgroundColor = '#1e90ff', textColor = '#333' }) {
    return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
            body { margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
            .header { background: linear-gradient(135deg, ${backgroundColor} 0%, ${adjustBrightness(backgroundColor, -20)} 100%); color: white; padding: 32px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
            .content { padding: 32px 24px; color: ${textColor}; line-height: 1.6; }
            .content p { margin: 0 0 16px 0; font-size: 16px; }
            .content strong { font-weight: 600; color: #1f2937; }
            .button { display: inline-block; background: linear-gradient(135deg, ${backgroundColor} 0%, ${adjustBrightness(backgroundColor, -15)} 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 20px 0; transition: all 0.3s ease; }
            .button:hover { transform: translateY(-2px); box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1); }
            .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 500; margin: 16px 0; }
            .status-pending { background-color: #fef3c7; color: #d97706; }
            .status-approved { background-color: #d1fae5; color: #065f46; }
            .status-rejected { background-color: #fee2e2; color: #dc2626; }
            .footer { background-color: #f8fafc; text-align: center; padding: 24px; border-top: 1px solid #e5e7eb; }
            .footer p { margin: 0; font-size: 12px; color: #6b7280; }
            .code-block { background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-family: 'Courier New', monospace; font-size: 14px; margin: 16px 0; word-break: break-all; }
            .highlight { background-color: #fef3c7; padding: 2px 6px; border-radius: 4px; }
            .icon { width: 48px; height: 48px; margin: 0 auto 16px auto; }
        </style>
    </head>
    <body>
        <div style="padding: 20px;">
            <div class="container">
                <div class="header">
                    <div class="icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                    </div>
                    <h1>${title}</h1>
                </div>
                <div class="content">
                    ${body}
                    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                        <p style="margin-bottom: 8px; color: #6b7280;">Salam hangat,</p>
                        <p style="margin: 0; font-weight: 600; color: #1f2937;">Tim Edura Platform</p>
                    </div>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} Edura Platform. Hak cipta dilindungi undang-undang.</p>
                    <p style="margin-top: 8px;">Platform pembelajaran AI terdepan di Indonesia</p>
                </div>
            </div>
        </div>
    </body>
    </html>`;
}

// Helper function to adjust color brightness
function adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}


async function sendMagicLinkEmail(to, token) {
    const frontendUrl = await getEnv('FRONTEND_BASE_URL');
    const link = `${frontendUrl}#/verify-email?token=${token}`;
    const html = emailLayout({
        title: 'Verifikasi Email Anda',
        backgroundColor: '#3b82f6',
        body: `
            <p>Halo!</p>
            <p>Terima kasih telah mendaftar di <strong>Edura Platform</strong>. Klik tombol di bawah ini untuk memverifikasi alamat email Anda:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${link}" class="button">Verifikasi Email</a>
            </div>
            <p>Jika tombol di atas tidak berfungsi, salin dan tempel URL berikut ke browser Anda:</p>
            <div class="code-block">${link}</div>
            <p><em>Link verifikasi ini akan kedaluwarsa dalam 24 jam.</em></p>
        `
    });

    await sendEmail({ to, subject: 'Verifikasi Email - Edura Platform', html });
}

async function sendOtpEmail(to, otp) {
    const html = emailLayout({
        title: 'Kode OTP Login Anda',
        backgroundColor: '#10b981',
        body: `
            <p>Halo!</p>
            <p>Gunakan kode OTP berikut untuk login ke akun Edura Anda:</p>
            <div style="text-align: center; margin: 24px 0; padding: 24px; background-color: #f3f4f6; border-radius: 12px;">
              <span style="font-size: 32px; letter-spacing: 8px; font-weight: 700; color: #10b981; font-family: 'Courier New', monospace;">${otp}</span>
            </div>
            <p>Kode ini akan <span class="highlight">kedaluwarsa dalam 5 menit</span>.</p>
            <p><em>Jangan bagikan kode ini kepada siapa pun untuk menjaga keamanan akun Anda.</em></p>
        `
    });

    await sendEmail({ to, subject: 'Kode OTP Login - Edura Platform', html });
}

async function sendPasswordResetLink(to, token) {
    const frontendUrl = await getEnv('FRONTEND_BASE_URL');
    const link = `${frontendUrl}#/reset-password?token=${token}`;
    const html = emailLayout({
        title: 'Reset Password Akun',
        backgroundColor: '#f59e0b',
        body: `
            <p>Halo!</p>
            <p>Kami menerima permintaan untuk mereset password akun Edura Anda. Klik tombol di bawah untuk membuat password baru:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${link}" class="button">Reset Password</a>
            </div>
            <p>Jika tombol tidak berfungsi, salin dan tempel URL berikut:</p>
            <div class="code-block">${link}</div>
            <p><span class="highlight">Link ini akan kedaluwarsa dalam 1 jam</span>.</p>
            <p><em>Jika Anda tidak meminta reset password, abaikan email ini.</em></p>
        `
    });

    await sendEmail({ to, subject: 'Reset Password - Edura Platform', html });
}

async function sendStudentNotification(to, { studentName, message, course_id }) {
    const frontendUrl = await getEnv('FRONTEND_BASE_URL');

    let courseTitle = 'course di Edura';
    if (course_id) {
        try {
            const { data } = await db
                .from('courses')
                .select('title')
                .eq('id', course_id)
                .maybeSingle();

            if (data?.title) courseTitle = `"${data.title}"`;
        } catch (e) {
            //console.warn('⚠️ Gagal mengambil course title, fallback ke default.');
        }
    }

    const html = emailLayout({
        title: 'Pengingat dari Dosen Anda',
        backgroundColor: '#8b5cf6',
        body: `
            <p>Halo <strong>${studentName}</strong>!</p>
            <p>Anda memiliki pengingat baru untuk course: <strong>${courseTitle}</strong></p>
            <div style="background-color: #f8fafc; border-left: 4px solid #8b5cf6; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-style: italic; color: #4b5563;">"${message}"</p>
            </div>
            <div style="text-align: center; margin: 24px 0;">
                <a href="${frontendUrl}" class="button">Buka Edura Platform</a>
            </div>
            <p>Tetap semangat dalam belajar! 🚀</p>
        `
    });

    await sendEmail({ to, subject: `Pengingat: ${courseTitle}`, html });
}

async function sendCertificateEmail(to, pdfBuffer) {
    const html = emailLayout({
        title: 'Selamat! Sertifikat Anda Siap',
        backgroundColor: '#059669',
        body: `
            <div style="text-align: center;">
                <div class="icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="color: #059669;">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
            </div>
            <p>Selamat atas pencapaian luar biasa Anda!</p>
            <p>Anda telah berhasil menyelesaikan course di <strong>Edura Platform</strong>. Sertifikat penyelesaian Anda telah siap dan terlampir dalam email ini.</p>
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #059669; font-weight: 500;">📎 Sertifikat terlampir sebagai file PDF</p>
            </div>
            <p>Sertifikat ini dapat Anda gunakan untuk:</p>
            <ul style="color: #4b5563; margin: 16px 0;">
                <li>Melengkapi portofolio profesional</li>
                <li>Menunjukkan kompetensi kepada employer</li>
                <li>Melanjutkan ke level pembelajaran berikutnya</li>
            </ul>
            <p>Terima kasih telah mempercayai Edura Platform untuk perjalanan pembelajaran Anda! 🎉</p>
        `
    });

    await sendEmail({
        to,
        subject: '🎓 Sertifikat Course Anda - Edura Platform',
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
    let backgroundColor = '#3b82f6';

    if (status === 'settlement' || status === 'capture') {
        title = '✅ Pembayaran Berhasil';
        backgroundColor = '#10b981';
        body = `
            <div style="text-align: center;">
                <div class="icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="color: #10b981;">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
            </div>
            <p>Halo <strong>${userName}</strong>!</p>
            <p>Terima kasih telah melakukan pembayaran sebesar <span class="highlight"><strong>Rp ${amount.toLocaleString()}</strong></span>.</p>
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
                <span class="status-badge status-approved">🎉 Akun Premium Aktif</span>
                <p style="margin: 8px 0 0 0; color: #059669; font-weight: 500;">Selamat! Akun Anda telah di-upgrade ke Premium.</p>
            </div>
            <p>Nikmati fitur eksklusif Premium:</p>
            <ul style="color: #4b5563;">
                <li>Akses unlimited ke semua course</li>
                <li>Download materi pembelajaran</li>
                <li>Sertifikat premium</li>
                <li>Support prioritas</li>
            </ul>
        `;
    } else if (status === 'pending') {
        title = '⏳ Pembayaran Sedang Diproses';
        backgroundColor = '#f59e0b';
        body = `
            <div style="text-align: center;">
                <span class="status-badge status-pending">⏳ Sedang Diproses</span>
            </div>
            <p>Halo <strong>${userName}</strong>!</p>
            <p>Pembayaran Anda sedang dalam proses verifikasi. Kami akan mengirimkan notifikasi setelah pembayaran berhasil dikonfirmasi.</p>
            <p>Biasanya proses ini memakan waktu 5-15 menit.</p>
            <p><em>Terima kasih atas kesabaran Anda.</em></p>
        `;
    } else {
        title = '❌ Pembayaran Gagal';
        backgroundColor = '#ef4444';
        body = `
            <div style="text-align: center;">
                <span class="status-badge status-rejected">❌ Pembayaran Gagal</span>
            </div>
            <p>Halo <strong>${userName}</strong>,</p>
            <p>Maaf, pembayaran Anda sebesar <strong>Rp ${amount.toLocaleString()}</strong> gagal diproses.</p>
            <p>Silakan coba lagi dengan metode pembayaran yang berbeda atau hubungi customer service kami jika masalah berlanjut.</p>
            <div style="background-color: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #dc2626; font-weight: 500;">💡 Tips: Pastikan saldo mencukupi dan data kartu benar</p>
            </div>
        `;
    }

    const html = emailLayout({ title, body, backgroundColor });
    await sendEmail({ to, subject: title + ' - Edura Platform', html });
}

// UPDATED: sendTeacherRequestStatusEmail to accept setupLink parameter
async function sendTeacherRequestStatusEmail(to, status, fullName = '', setupLink = null) {
    let title = '';
    let body = '';
    let backgroundColor = '#3b82f6';

    // Extract name from email if fullName not provided
    const displayName = fullName || to.split('@')[0];

    if (status === 'pending') {
        title = '📋 Pengajuan Akun Dosen Diterima';
        backgroundColor = '#f59e0b';
        body = `
            <div style="text-align: center;">
                <span class="status-badge status-pending">⏳ Sedang Ditinjau</span>
            </div>
            <p>Halo <strong>${displayName}</strong>!</p>
            <p>Pengajuan Anda untuk menjadi dosen di <strong>Edura Platform</strong> telah kami terima dan sedang dalam proses peninjauan.</p>
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #d97706; font-weight: 500;">⏱️ Estimasi waktu peninjauan: 1-3 hari kerja</p>
            </div>
            <p>Tim kami akan menghubungi Anda kembali setelah proses verifikasi selesai.</p>
            <p>Terima kasih atas minat Anda bergabung dengan kami! 🙏</p>
        `;
    } else if (status === 'approved') {
        title = '🎉 Pengajuan Dosen Disetujui';
        backgroundColor = '#10b981';

        // Include setup link in the email body when provided
        const setupSection = setupLink ? `
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #d97706; font-weight: 600;">🔐 Setup Password Anda</p>
                <p style="margin: 0 0 12px 0; color: #d97706; font-size: 14px;">Sebelum mulai mengajar, Anda perlu mengatur password untuk akun Anda.</p>
                <div style="text-align: center;">
                    <a href="${setupLink}" class="button" style="background: linear-gradient(135deg, #f59e0b 0%, ${adjustBrightness('#f59e0b', -15)} 100%);">Setup Password</a>
                </div>
                <p style="margin: 12px 0 0 0; color: #d97706; font-size: 12px; font-style: italic;">Link ini akan kedaluwarsa dalam 24 jam</p>
            </div>
            <p>Atau salin link berikut jika tombol tidak berfungsi:</p>
            <div class="code-block">${setupLink}</div>
        ` : '';

        body = `
            <div style="text-align: center;">
                <div class="icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="color: #10b981;">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <span class="status-badge status-approved">✅ Disetujui</span>
            </div>
            <p>Selamat <strong>${displayName}</strong>!</p>
            <p>Pengajuan Anda sebagai dosen di <strong>Edura Platform</strong> telah <span class="highlight">disetujui</span>.</p>
            ${setupSection}
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #059669; font-weight: 600;">🚀 Selamat Bergabung!</p>
                <p style="margin: 0; color: #059669; font-size: 14px;">Setelah setup password, Anda dapat langsung mulai membuat course.</p>
            </div>
            <p>Fitur yang dapat Anda gunakan:</p>
            <ul style="color: #4b5563;">
                <li>Memverifikasi Course Student Anda</li>
                <li>Sunting Materi Pembelajaran</li>
                <li>Membuat Kelas</li>
                <li>Mengelola Student dalam Kelas</li>
                <li>Kirim Sertifikat dan Reminder</li>
            </ul>
            <p>Selamat datang di keluarga besar <strong>Edura Platform</strong>! 🎓</p>
        `;
    } else if (status === 'rejected') {
        title = '❌ Pengajuan Dosen Ditolak';
        backgroundColor = '#ef4444';
        body = `
            <div style="text-align: center;">
                <span class="status-badge status-rejected">❌ Ditolak</span>
            </div>
            <p>Halo <strong>${displayName}</strong>,</p>
            <p>Mohon maaf, setelah melalui proses peninjauan, pengajuan Anda sebagai dosen di Edura Platform <strong>belum dapat kami setujui</strong> pada saat ini.</p>
            <div style="background-color: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #dc2626; font-weight: 500;">📞 Hubungi Admin untuk Informasi Lebih Lanjut</p>
                <p style="margin: 0; color: #dc2626; font-size: 14px;">Tim kami siap membantu menjelaskan persyaratan yang diperlukan.</p>
            </div>
            <p>Jangan berkecil hati! Anda masih dapat:</p>
            <ul style="color: #4b5563;">
                <li>Mengajukan kembali dengan dokumen yang lebih lengkap</li>
                <li>Mengikuti pelatihan dosen terlebih dahulu</li>
                <li>Berkontribusi sebagai expert di komunitas</li>
            </ul>
            <p>Terima kasih atas pengertian Anda. 🙏</p>
        `;
    }

    const html = emailLayout({ title, body, backgroundColor });
    await sendEmail({ to, subject: title + ' - Edura Platform', html });
}

// Email konfirmasi pengajuan teacher request
async function sendTeacherRequestConfirmationEmail(to, fullName) {
    const html = emailLayout({
        title: '📋 Konfirmasi Pengajuan Dosen',
        backgroundColor: '#3b82f6',
        body: `
            <p>Halo <strong>${fullName}</strong>!</p>
            <p>Terima kasih telah mengajukan diri menjadi dosen di <strong>Edura Platform</strong>.</p>
            <div style="background-color: #f0f9ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #1e40af; font-weight: 500;">✅ Pengajuan Anda telah berhasil dikirim</p>
            </div>
            <p>Tim kami akan meninjau pengajuan Anda dalam <span class="highlight">1-3 hari kerja</span>. Kami akan mengirimkan email notifikasi begitu proses peninjauan selesai.</p>
            <p>Jika ada pertanyaan, jangan ragu untuk menghubungi tim support kami.</p>
            <p>Terima kasih atas minat Anda bergabung dengan Edura Platform! 🚀</p>
        `
    });

    await sendEmail({ to, subject: 'Konfirmasi Pengajuan Dosen - Edura Platform', html });
}

// NEW: Send teacher password setup email (optional, if you want a dedicated function)
async function sendTeacherPasswordSetupEmail(to, fullName, setupLink) {
    const html = emailLayout({
        title: '🔐 Setup Password Akun Dosen',
        backgroundColor: '#7c3aed',
        body: `
            <p>Halo <strong>${fullName}</strong>!</p>
            <p>Selamat! Pengajuan Anda sebagai dosen telah disetujui. Sekarang saatnya mengatur password untuk akun Anda.</p>
            <div style="background-color: #f3e8ff; border: 1px solid #7c3aed; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
                <p style="margin: 0 0 16px 0; color: #6b21a8; font-weight: 500;">Klik tombol di bawah untuk setup password:</p>
                <a href="${setupLink}" class="button" style="background: linear-gradient(135deg, #7c3aed 0%, ${adjustBrightness('#7c3aed', -15)} 100%);">Setup Password Sekarang</a>
            </div>
            <p>Atau salin link berikut jika tombol tidak berfungsi:</p>
            <div class="code-block">${setupLink}</div>
            <p><span class="highlight">⏰ Link ini akan kedaluwarsa dalam 24 jam</span></p>
            <div style="background-color: #f0f9ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #1e40af; font-weight: 500;">💡 Tips Password yang Kuat:</p>
                <ul style="margin: 8px 0 0 0; color: #1e40af; font-size: 14px;">
                    <li>Minimal 8 karakter</li>
                    <li>Kombinasi huruf besar dan kecil</li>
                    <li>Sertakan angka</li>
                    <li>Tambahkan karakter khusus (!@#$%)</li>
                </ul>
            </div>
            <p>Setelah setup password, Anda dapat langsung login dan mulai membuat course di Edura Platform.</p>
            <p>Selamat bergabung dengan komunitas pengajar Edura! 🎓</p>
        `
    });

    await sendEmail({ to, subject: '🔐 Setup Password Akun Dosen - Edura Platform', html });
}
async function sendNewUserCredentialsEmail({ to, fullName, email, password, role }) {
    const frontendUrl = await getEnv('FRONTEND_BASE_URL');
    const html = emailLayout({
        title: 'Akun EduraApp Anda Telah Dibuat',
        backgroundColor: '#7c3aed', // Warna ungu yang menarik
        body: `
            <p>Halo <strong>${fullName}</strong>!</p>
            <p>Selamat datang di <strong>Edura Platform</strong>. Seorang admin telah membuatkan akun untuk Anda dengan detail sebagai berikut:</p>
            <div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 12px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 0 0 12px 0;"><strong>Password Sementara:</strong></p>
                <div class="code-block" style="text-align: center; font-size: 16px; letter-spacing: 2px;">${password}</div>
                <p style="margin: 12px 0 0 0;"><strong>Role:</strong> <span class="highlight">${role}</span></p>
            </div>
            <p>Kami sangat menyarankan Anda untuk segera login dan mengubah password Anda untuk keamanan.</p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="${frontendUrl}" class="button">Login Sekarang</a>
            </div>
            <p>Selamat bergabung dan mulai berkontribusi di Edura Platform! 🚀</p>
        `
    });

    await sendEmail({
        to,
        subject: 'Selamat Datang di Edura Platform!',
        html
    });
}

async function sendLogBackupEmail(to, backupDetails, backupBuffer) {
    const { filename, backupDate, logCount, adminName, backupType } = backupDetails;

    const html = emailLayout({
        title: '📦 Log Backup Otomatis - Edura Platform',
        backgroundColor: '#6366f1',
        body: `
            <p>Halo <strong>${adminName}</strong>!</p>
            <p>Backup log otomatis telah berhasil dilakukan untuk sistem <strong>Edura Platform</strong>.</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <h4 style="margin: 0 0 12px 0; color: #1f2937;">📊 Detail Backup:</h4>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                    <li><strong>Tanggal Log:</strong> ${backupDate}</li>
                    <li><strong>Jumlah Log:</strong> ${logCount.toLocaleString()} entri</li>
                    <li><strong>Nama File:</strong> ${filename}</li>
                    <li><strong>Tipe Backup:</strong> ${backupType === 'daily' ? 'Harian Otomatis' : 'Manual'}</li>
                    <li><strong>Waktu Backup:</strong> ${new Date().toLocaleString('id-ID')}</li>
                </ul>
            </div>

            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #059669; font-weight: 500;">
                    📎 File backup terlampir dalam email ini dan log telah dihapus dari database untuk menghemat ruang penyimpanan.
                </p>
            </div>

            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <h4 style="margin: 0 0 8px 0; color: #d97706;">⚠️ Penting:</h4>
                <ul style="margin: 0; padding-left: 20px; color: #d97706; font-size: 14px;">
                    <li>Simpan file backup ini dengan aman</li>
                    <li>Log telah dihapus dari database sistem</li>
                    <li>Backup ini diperlukan untuk audit dan troubleshooting</li>
                </ul>
            </div>
            <p>Terima kasih telah menjaga keamanan dan performa sistem! 🛡️</p>
        `
    });

    // CORRECTED: Use the sendEmail helper function
    await sendEmail({
        to,
        subject: `📦 Log Backup ${backupDate} - Edura Platform`,
        html,
        attachments: [{
            filename: filename,
            content: backupBuffer,
            contentType: filename.endsWith('.json') ? 'application/json' : 'text/plain'
        }]
    });
}

async function sendBackupErrorEmail(to, error) {
    const html = emailLayout({
        title: '❌ Backup Error - Edura Platform',
        backgroundColor: '#ef4444',
        body: `
            <p>Halo Admin!</p>
            <p>Terjadi error pada proses backup otomatis sistem <strong>Edura Platform</strong>.</p>
            
            <div style="background-color: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <h4 style="margin: 0 0 12px 0; color: #dc2626;">Error Details:</h4>
                <pre style="margin: 0; color: #dc2626; font-size: 14px; white-space: pre-wrap;">${error.message || 'Unknown error'}</pre>
            </div>

            <p>Silakan periksa sistem dan lakukan backup manual jika diperlukan.</p>
            <p>Waktu error: ${new Date().toLocaleString('id-ID')}</p>
        `
    });

    // CORRECTED: Use the sendEmail helper function
    await sendEmail({
        to,
        subject: '❌ Backup Error - Edura Platform',
        html
    });
}

async function sendCleanupNotificationEmail(to, details) {
    const { adminName, deletedCount, cutoffDate, retentionDays } = details;

    const html = emailLayout({
        title: '🧹 Cleanup Log Otomatis - Edura Platform',
        backgroundColor: '#8b5cf6',
        body: `
            <p>Halo <strong>${adminName}</strong>!</p>
            <p>Cleanup log otomatis telah berhasil dilakukan pada sistem <strong>Edura Platform</strong>.</p>
            
            <div style="background-color: #f3e8ff; border: 1px solid #8b5cf6; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <h4 style="margin: 0 0 12px 0; color: #7c3aed;">📊 Detail Cleanup:</h4>
                <ul style="margin: 0; padding-left: 20px; color: #7c3aed;">
                    <li><strong>Log Dihapus:</strong> ${deletedCount.toLocaleString()} entri</li>
                    <li><strong>Retensi:</strong> ${retentionDays} hari</li>
                    <li><strong>Cutoff Date:</strong> ${new Date(cutoffDate).toLocaleDateString('id-ID')}</li>
                    <li><strong>Waktu Cleanup:</strong> ${new Date().toLocaleString('id-ID')}</li>
                </ul>
            </div>
            
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #059669; font-weight: 500;">
                    ✅ Log lama telah dibersihkan untuk mengoptimalkan performa database
                </p>
            </div>
            <p>Cleanup otomatis berjalan setiap minggu untuk menjaga performa sistem.</p>
        `
    });

    // CORRECTED: Use the sendEmail helper function
    await sendEmail({
        to,
        subject: '🧹 Cleanup Log Completed - Edura Platform',
        html
    });
}

module.exports = {
    sendMagicLinkEmail,
    sendOtpEmail,
    sendPasswordResetLink,
    sendStudentNotification,
    sendCertificateEmail,
    sendPaymentStatusEmail,
    sendTeacherRequestStatusEmail,
    sendTeacherRequestConfirmationEmail,
    sendTeacherPasswordSetupEmail,
    sendNewUserCredentialsEmail,
    sendLogBackupEmail,
    sendBackupErrorEmail,
    sendCleanupNotificationEmail
};