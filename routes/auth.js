const express = require('express');
const authenticate = require('../middleware/authenticate');

function createAuthRouter(supabase) {
  const router = express.Router();

  router.get('/me', authenticate(supabase), (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email ?? null,
      },
    });
  });

  return router;
}

module.exports = createAuthRouter;
