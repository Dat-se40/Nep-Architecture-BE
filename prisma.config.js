require('./configuration/environment');

const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use a direct connection or Supabase session pooler (port 5432).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.DB_URL,
  },
});
