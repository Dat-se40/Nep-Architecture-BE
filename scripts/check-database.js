const db = require('../configuration/database');

async function check() {
  const [result] = await db.$queryRaw`SELECT 1 AS ok`;
  if (result.ok !== 1) throw new Error('Unexpected database response.');
  console.log('Database connection OK.');
}

check()
  .catch((error) => {
    console.error('Database connection failed:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
