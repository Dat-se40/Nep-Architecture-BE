
const db = require('./configuration/database');
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {

});

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

start().catch(async (error) => {
  console.error('Unable to connect to the database:', error.code || error.message);
  await db.$disconnect();
  process.exitCode = 1;
});
