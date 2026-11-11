const express = require('express');
const authenticate = require('../middleware/authenticate');
const { getUserRole } = require('../services/admin-access');
const validation = require('../validation/auth');
const { createAuthService, AuthError } = require('../services/auth');
const multer = require('multer');
const { uploadAvatar } = require('../services/avatar');
const authLanding = require('./auth-landing');
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });

function createAuthRouter(supabase, resolveRole = getUserRole, service = createAuthService(), uploadAccountAvatar = uploadAvatar) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const action = (run, successStatus) => async (req, res, next) => {
    try {
      const result = await run(req);
      const status = successStatus || result.status;
      if (status === 204) return res.status(204).end();
      return res.status(status).json(result.body);
    } catch (error) {
      if (!(error instanceof AuthError)) return next(error);
      if (error.retryAfter) res.set('Retry-After', error.retryAfter);
      // Keep error_code for the SDK's REST transport, without exposing provider details.
      return res.status(error.status).json({ error: error.message, code: error.code, error_code: error.code });
    }
  };

  router.post('/register', action(req => service.register(validation.register.parse(req.body), validation.redirectQuery.parse(req.query).redirect_to), 201));
  router.post('/login', action(req => service.login(validation.login.parse(req.body))));
  router.post('/forgot-password', action(req => service.forgotPassword(validation.forgotPassword.parse(req.body), validation.redirectQuery.parse(req.query).redirect_to)));
  router.post('/resend-confirmation', action(req => service.resendConfirmation(validation.resendConfirmation.parse(req.body), validation.redirectQuery.parse(req.query).redirect_to)));
  router.post('/callback', action(req => service.callback(validation.callback.parse(req.body))));
  router.post('/verify-email', action(req => service.verifyEmail(validation.verifyEmail.parse(req.body))));
  router.get('/callback', authLanding(service.frontendCallbackUrl || 'http://localhost:3000/#/auth/callback'));
  router.post('/refresh', action(req => service.refresh(validation.refresh.parse(req.body))));
  router.put('/password', authenticate(supabase), action(req => service.updatePassword(req.accessToken, req.user, validation.updatePassword.parse(req.body))));
  router.post('/logout', authenticate(supabase), action(req => service.logout(req.accessToken, validation.logoutQuery.parse(req.query).scope)));
  router.get('/user', authenticate(supabase), (req, res) => res.json(req.user));
  router.post('/avatar', authenticate(supabase), avatarUpload.single('avatar'), action(async req => ({ status: 200, body: await uploadAccountAvatar(req.user, req.accessToken, req.file, service) })));

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
