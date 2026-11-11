const { randomUUID } = require('node:crypto');
const { encodeImage } = require('./image-processing');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getR2Client, r2Config, publicImageUrl } = require('../configuration/r2');
const HttpError = require('../lib/http-error');

async function uploadProjectImage(db, file, metadata, client = getR2Client()) {
  if (!client) throw new HttpError(503, 'Máy chủ chưa cấu hình lưu trữ ảnh R2.');
  if (!file) throw new HttpError(400, 'Bạn chưa chọn ảnh.');

  const buffer = await encodeImage(file.buffer);

  const { bucket, prefix } = r2Config();
  const objectKey = [prefix, 'projects', `${randomUUID()}.webp`].filter(Boolean).join('/');
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
  } catch {
    throw new HttpError(502, 'Không tải được ảnh lên R2. Kiểm tra cấu hình bucket và Access Key.');
  }

  let image;
  try {
    image = await db.image.create({ data: { bucket, objectKey, mime: 'image/webp', bytes: BigInt(buffer.length), ...metadata } });
  } catch (error) {
    try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })); }
    catch { console.error('Could not clean up an unreferenced uploaded image.'); }
    throw error;
  }
  return { id: image.id.toString(), url: publicImageUrl(image), alt: image.alt, credit: image.credit };
}

module.exports = { uploadProjectImage };
