require('./environment');
const { S3Client } = require('@aws-sdk/client-s3');

function r2Config() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_MEDIA_BUCKET || 'nep-media',
    prefix: (process.env.R2_MEDIA_PREFIX || '').trim().replace(/^\/+|\/+$/g, ''),
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
    endpoint: process.env.R2_ENDPOINT,
  };
}

function isR2Configured() {
  const config = r2Config();
  return Boolean(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucket && config.publicBaseUrl);
}

let client;
function getR2Client() {
  if (!isR2Configured()) return null;
  if (!client) {
    const config = r2Config();
    client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestHandler: { requestTimeout: 15000, connectionTimeout: 10000 },
    });
  }
  return client;
}

function publicImageUrl(image) {
  const config = r2Config();
  if (!config.publicBaseUrl || image.bucket !== config.bucket) return null;
  return `${config.publicBaseUrl}/${image.objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

module.exports = { r2Config, isR2Configured, getR2Client, publicImageUrl };
