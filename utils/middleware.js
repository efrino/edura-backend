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

  // Ambil data lengkap user dari Supabase
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, plan, plan_expires_at')
    .eq('id', decoded.id)
    .single();

  if (error || !user) {
    throw Boom.unauthorized('User not found');
  }

  // Cek apakah plan premium sudah expired
  if (user.plan === 'premium' && user.plan_expires_at) {
    const now = new Date();
    const expires = new Date(user.plan_expires_at);

    if (expires < now) {
      // Auto downgrade ke free
      await supabase.from('users')
        .update({ plan: 'free', plan_expires_at: null })
        .eq('id', user.id);

      user.plan = 'free';
      user.plan_expires_at = null;
    }
  }

  // Inject data user ke request.auth.credentials
  request.auth = { credentials: user };
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
