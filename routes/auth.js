const express = require('express');
const authenticate = require('../middleware/authenticate');
const { getUserRole } = require('../services/admin-access');

function createAuthRouter(supabase, resolveRole = getUserRole) {
  const router = express.Router();

  router.get('/me', authenticate(supabase), async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const role = await resolveRole(req.user.id);
      return res.json({
        user: {
          id: req.user.id,
          email: req.user.email ?? null,
          role,
        },
      });
    } catch {
      return res.status(503).json({ error: 'Unable to check account permissions. Please try again later.' });
    }
  });

  return router;
}

module.exports = createAuthRouter;
