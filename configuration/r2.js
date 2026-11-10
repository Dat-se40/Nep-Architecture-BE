require('./environment');

function r2Config() {
  return {
    bucket: process.env.R2_MEDIA_BUCKET || 'nep-media',
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, ''),
  };
}

function publicImageUrl(image) {
  const config = r2Config();
  if (!config.publicBaseUrl || image.bucket !== config.bucket) return null;
  return `${config.publicBaseUrl}/${image.objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

function isR2Configured() { return false; }

module.exports = { r2Config, publicImageUrl, isR2Configured };
