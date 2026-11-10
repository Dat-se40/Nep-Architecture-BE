function authenticate(supabase) {
  return async (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');

    if (!match) {
      return res.status(401).json({ error: 'A Bearer access token is required.' });
    }

    try {
      // Verify with Supabase Auth; never trust a token's decoded payload alone.
      const { data, error } = await supabase.auth.getUser(match[1]);

      if (error) {
        const unavailable = !error.status || error.status >= 500 || error.status === 429;
        return res.status(unavailable ? 503 : 401).json({
          error: unavailable
            ? 'Authentication service is temporarily unavailable.'
            : 'The access token is invalid or expired.',
        });
      }

      if (!data?.user?.id) {
        return res.status(401).json({ error: 'The access token is invalid or expired.' });
      }

      req.user = data.user;
      return next();
    } catch {
      return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
    }
  };
}

module.exports = authenticate;
