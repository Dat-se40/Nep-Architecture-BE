const { getUserRole } = require('../services/admin-access');

function requireAdmin(resolveRole = getUserRole) {
  return async (req, res, next) => {
    try {
      const role = await resolveRole(req.user.id);
      if (role !== 'admin') return res.status(403).json({ error: 'Bạn không có quyền quản trị.' });
      req.role = role;
      return next();
    } catch {
      return res.status(503).json({ error: 'Chưa kiểm tra được quyền quản trị. Vui lòng thử lại.' });
    }
  };
}

module.exports = requireAdmin;
