const jwt = require('jsonwebtoken');
const Boom = require('@hapi/boom');
const supabase = require('../db');

async function verifyToken(request, h) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Boom.unauthorized('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw Boom.unauthorized('Invalid or expired token');
  }

  // Ambil user dasar
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, plan, plan_expires_at')
    .eq('id', decoded.id)
    .single();

  if (error || !user) {
    throw Boom.unauthorized('User not found');
  }

  // Cek expired plan
  if (user.plan === 'premium' && user.plan_expires_at) {
    const now = new Date();
    const expires = new Date(user.plan_expires_at);

    if (expires < now) {
      await supabase.from('users')
        .update({ plan: 'free', plan_expires_at: null })
        .eq('id', user.id);
      user.plan = 'free';
      user.plan_expires_at = null;
    }
  }

  // Jika role teacher, ambil daftar class_id yang dia pegang
  if (user.role === 'teacher') {
    const { data: teacherClassData, error: classErr } = await supabase
      .from('teacher_classes')
      .select('class_id')
      .eq('teacher_id', user.id);

    if (!classErr && teacherClassData) {
      user.class_ids = teacherClassData.map((c) => c.class_id); // simpan array class_id
    } else {
      user.class_ids = [];
    }

    // Ambil juga program_studi dari profil
    const { data: teacherProfile } = await supabase
      .from('teacher_profiles')
      .select('program_studi')
      .eq('user_id', user.id)
      .maybeSingle();

    if (teacherProfile) {
      user.program_studi = teacherProfile.program_studi;
    }
  }

  // Inject
  request.auth = {
    isAuthenticated: true,
    credentials: user
  };
  return h.continue;
}
// Role-based access control
function requireRole(...allowedRoles) {
  return (request, h) => {
    const user = request.auth.credentials;
    if (!user || !allowedRoles.includes(user.role)) {
      throw Boom.forbidden('You do not have permission to access this resource');
    }
    return h.continue;
  };
}

module.exports = { verifyToken, requireRole };
