// utils/middleware.js
const jwt = require('jsonwebtoken');
const Boom = require('@hapi/boom');
const supabase = require('../db');
const { getEnv } = require('./env'); // ← tambahkan ini

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-otp',
  '/resend-otp',
  '/verify-email',
  '/send-magic-link',
  '/',
  '/public/class-code-info',
  '/enums',
  '/setup-teacher-password',
  '/resend-teacher-setup-link',
];

async function verifyToken(request, h) {
  const isPublic = PUBLIC_ROUTES.includes(request.path);

  // Allow public route: return dummy credentials
  if (isPublic) {
    request.auth = {
      isAuthenticated: false,
      credentials: {},
    };
    return h.continue;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Boom.unauthorized('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    const jwtSecret = await getEnv('JWT_SECRET'); // ← ambil dari Supabase
    decoded = jwt.verify(token, jwtSecret);
  } catch (err) {
    throw Boom.unauthorized('Invalid or expired token');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, plan, plan_expires_at')
    .eq('id', decoded.id)
    .single();

  if (error || !user) {
    throw Boom.unauthorized('User not found');
  }

  // Expired premium plan
  if (user.plan === 'premium' && user.plan_expires_at) {
    const now = new Date();
    const expires = new Date(user.plan_expires_at);
    if (expires < now) {
      await supabase
        .from('users')
        .update({ plan: 'free', plan_expires_at: null })
        .eq('id', user.id);
      user.plan = 'free';
      user.plan_expires_at = null;
    }
  }

  // Teacher info
  if (user.role === 'teacher') {
    // Ambil id kelas dengan benar
    const { data: classData } = await supabase
      .from('classes')
      .select('id') // ← ubah dari 'name' menjadi 'id'
      .eq('teacher_id', user.id);

    user.class_ids = classData?.map(c => c.id) || [];

    const { data: profile } = await supabase
      .from('teacher_profiles')
      .select('program_studi')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile) user.program_studi = profile.program_studi;
  }

  request.auth = {
    isAuthenticated: true,
    credentials: user,
  };

  return h.continue;
}

function requireRole(...allowedRoles) {
  return (request, h) => {
    const user = request.auth?.credentials;
    if (!user || !allowedRoles.includes(user.role)) {
      throw Boom.forbidden('You do not have permission to access this resource');
    }
    return h.continue;
  };
}

module.exports = { verifyToken, requireRole };
