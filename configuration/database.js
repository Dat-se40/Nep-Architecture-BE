require('./environment');

const { PrismaClient } = require('../generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

if (!connectionString) {
  throw new Error('Set DATABASE_URL (or DB_URL) in .env before starting the backend.');
}

function createClient() {
  const adapter = new PrismaPg(
    {
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
    { schema: 'nep' },
  );

  return new PrismaClient({ adapter });
}

const db = globalThis.nepPrisma || createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.nepPrisma = db;
}

module.exports = db;
