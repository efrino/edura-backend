// utils/middleware.js
const jwt = require('jsonwebtoken');
const Boom = require('@hapi/boom');

function verifyToken(request, h) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Boom.unauthorized('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    request.auth = { credentials: decoded }; // inject ke request
    return h.continue;
  } catch (err) {
    throw Boom.unauthorized('Invalid or expired token');
  }
}
// Role-based access
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
