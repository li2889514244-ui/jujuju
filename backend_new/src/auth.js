const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || '97c8b81752478a5567e8383274541183689a3baca2bc11947ba7a7ed9dc30117ef44002f6e0ce856ddf6da652110e3049210dad8f9f9f9a099831225b01a0fa9';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录', data: null });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ code: 401, message: 'Token无效或已过期', data: null });
  }
}

// Only require auth if the route is not public
function requireAuth(req, res, next) {
  // List of public endpoints
  const publicPaths = [
    '/api/v1/auth/register',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/logout',
    '/api/v1/health',
  ];
  if (publicPaths.includes(req.path) || req.path === '/api/v1/health') {
    return next();
  }
  return authMiddleware(req, res, next);
}

module.exports = { authMiddleware, requireAuth };
