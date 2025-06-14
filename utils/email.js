const nodemailer = require('nodemailer');
require('dotenv').config();

// Setup transporter untuk Mailtrap
const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: process.env.MAILTRAP_PORT,
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS
    }
});

// Template email layout (HTML wrapper)
function emailLayout({ title, body }) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #1e90ff; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0;">${title}</h2>
        </div>
        <div style="padding: 30px; font-size: 16px; color: #333;">
            ${body}
            <p style="margin-top: 30px;">Thanks,<br><strong>LMS Team</strong></p>
        </div>
        <div style="background-color: #f5f5f5; text-align: center; font-size: 12px; padding: 10px; color: #777;">
            © ${new Date().getFullYear()} LMS Platform. All rights reserved.
        </div>
    </div>`;
}

// 🔗 Kirim magic link verifikasi email
async function sendMagicLinkEmail(to, token) {
    const link = `${process.env.APP_BASE_URL}/verify-email?token=${token}`;
    const html = emailLayout({
        title: 'Verify Your Email Address',
        body: `
            <p>Hello,</p>
            <p>Click the button below to verify your email address:</p>
            <div style="text-align: center; margin: 20px 0;">
                <a href="${link}" style="background-color: #1e90ff; color: white; padding: 12px 20px; border-radius: 5px; text-decoration: none;">Verify Email</a>
            </div>
            <p>If the button above doesn't work, copy and paste this URL into your browser:</p>
            <code style="background-color: #f0f0f0; padding: 8px; display: block; word-break: break-all;">${link}</code>
        `
    });

    await transporter.sendMail({
        from: '"LMS Support" <noreply@lms.dev>',
        to,
        subject: 'Verify Your Email Address',
        html
    });
}

// 🔐 Kirim OTP untuk login (MFA)
async function sendOtpEmail(to, otp) {
    const html = emailLayout({
        title: 'Your One-Time Password (OTP)',
        body: `
            <p>Hello,</p>
            <p>Use the OTP code below to complete your login:</p>
            <div style="text-align: center; margin: 20px 0;">
                <span style="font-size: 28px; letter-spacing: 5px; font-weight: bold; color: #1e90ff;">${otp}</span>
            </div>
            <p>This OTP will expire in <strong>5 minutes</strong>.</p>
        `
    });

    await transporter.sendMail({
        from: '"LMS MFA" <noreply@lms.dev>',
        to,
        subject: 'Your Login OTP Code',
        html
    });
}

// ♻️ Kirim OTP reset password
async function sendPasswordResetOtp(to, otp) {
    const html = emailLayout({
        title: 'Reset Your LMS Password',
        body: `
            <p>Hello,</p>
            <p>Use the OTP code below to reset your password:</p>
            <div style="text-align: center; margin: 20px 0;">
                <span style="font-size: 28px; letter-spacing: 5px; font-weight: bold; color: #e67e22;">${otp}</span>
            </div>
            <p>This OTP will expire in <strong>5 minutes</strong>.</p>
            <p>If you didn’t request this reset, please ignore this email.</p>
        `
    });

    await transporter.sendMail({
        from: '"LMS Recovery" <noreply@lms.dev>',
        to,
        subject: 'Reset Your LMS Password',
        html
    });
}

module.exports = {
    sendMagicLinkEmail,
    sendOtpEmail,
    sendPasswordResetOtp
};
