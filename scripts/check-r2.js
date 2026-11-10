const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getR2Client, r2Config } = require('../configuration/r2');

async function check() {
  const client = getR2Client();
  if (!client) throw new Error('Điền R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_MEDIA_BUCKET và R2_PUBLIC_BASE_URL trong .env.');
  try {
    const { bucket, prefix } = r2Config();
    await client.send(new ListObjectsV2Command({ Bucket: bucket, ...(prefix ? { Prefix: `${prefix}/` } : {}), MaxKeys: 1 }));
    console.log('R2 bucket connection OK.');
  } finally {
    client.destroy();
  }
}

check().catch(error => {
  console.error('R2 check failed:', error.$metadata?.httpStatusCode ? `HTTP ${error.$metadata.httpStatusCode} (${error.name})` : error.code || error.message);
  process.exitCode = 1;
});
