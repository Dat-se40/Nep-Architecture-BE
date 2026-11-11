
const db = require('./configuration/database');
const express = require("express");
const cors = require('cors');
const supabase = require('./configuration/supabase');
const createAuthRouter = require('./routes/auth');
const { createPublicProjectsRouter, createAdminProjectsRouter } = require('./routes/projects');
const createMediaRouter = require('./routes/media');
const errorHandler = require('./middleware/error-handler');
const { apiReference } = require('@scalar/express-api-reference');
const openapi = require('./docs/openapi');
const authLanding = require('./routes/auth-landing');
const browserLanding = authLanding(`${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')}/#/auth/callback`);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));

app.get("/", (req, res) => {
  // If a provider's Site URL points at BE, show links rather than a blank JSON page.
  if (req.accepts(['json', 'html']) === 'html' || req.query.code || req.query.error || req.query.token_hash) return browserLanding(req, res);
  res.json({ status: 'ok' });
});

app.get('/openapi.json', (req, res) => res.json(openapi));
app.get('/docs', apiReference({
  url: '/openapi.json',
  pageTitle: 'Nép API Reference',
  persistAuth: false,
  telemetry: false,
}));

app.use('/api/auth', createAuthRouter(supabase));
app.use('/api/projects', createPublicProjectsRouter(db));
app.use('/api/admin/media', createMediaRouter(db, supabase));
app.use('/api/admin', createAdminProjectsRouter(db, supabase));
app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy API.' }));
app.use(errorHandler);

async function start() {
  await db.$connect();
  await db.$queryRaw`SELECT 1`;

  const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();

    server.close(async () => {
      try {
        await db.$disconnect();
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  start().catch(async (error) => {
    console.error('Unable to connect to the database:', error.code || error.message);
    await db.$disconnect();
    process.exitCode = 1;
  });
}

module.exports = app;
