const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
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
            <p style="margin-top: 30px;">Thanks,<br><strong>Edura Team</strong></p>
        </div>
        <div style="background-color: #f5f5f5; text-align: center; font-size: 12px; padding: 10px; color: #777;">
            © ${new Date().getFullYear()} Edura Platform. All rights reserved.
        </div>
    </div>`;
}

// 🔗 Kirim magic link verifikasi email
async function sendMagicLinkEmail(to, token) {
    const link = `${process.env.FRONTEND_BASE_URL}#/verify-email?token=${token}`;
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
        from: '"Edura CS" <edura@efrino.web.id>',
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
        from: '"Edura CS" <edura@efrino.web.id>',
        to,
        subject: 'Your Login OTP Code',
        html
    });
}

async function sendPasswordResetLink(to, token) {
    const link = `${process.env.FRONTEND_BASE_URL}#/reset-password?token=${token}`;
    const html = emailLayout({
        title: 'Reset Your Password',
        body: `
      <p>Hello,</p>
      <p>Click the button below to reset your Edura account password:</p>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${link}" style="background-color: #e67e22; color: white; padding: 12px 20px; border-radius: 5px; text-decoration: none;">Reset Password</a>
      </div>
      <p>If the button above doesn't work, copy and paste this URL into your browser:</p>
      <code style="background-color: #f0f0f0; padding: 8px; display: block; word-break: break-all;">${link}</code>
      <p>This link will expire in <strong>1 hour</strong>.</p>
    `
    });

    await transporter.sendMail({
        from: '"Edura CS" <edura@efrino.web.id>',
        to,
        subject: 'Reset Your Edura Password',
        html
    });
}
// 📢 Notifikasi dari Teacher ke Student
async function sendStudentNotification(to, { studentName, message }) {
    const html = emailLayout({
        title: 'Progress Reminder from Your Teacher',
        body: `
      <p>Dear <strong>${studentName}</strong>,</p>
      <p>${message}</p>
      <p>Please check your progress in <a href="${process.env.FRONTEND_BASE_URL}">Edura LMS</a>.</p>
    `
    });

    await transporter.sendMail({
        from: '"Edura CS" <edura@efrino.web.id>',
        to,
        subject: 'Reminder from Your Teacher',
        html
    });
}

module.exports = {
    sendMagicLinkEmail,
    sendOtpEmail,
    sendPasswordResetLink,
    sendStudentNotification
};
