const { randomUUID } = require('node:crypto');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getR2Client, r2Config, publicImageUrl } = require('../configuration/r2');
const { encodeImage } = require('./image-processing');
const HttpError = require('../lib/http-error');

async function uploadAvatar(user, token, file, authService, client = getR2Client()) {
  if (!client) throw new HttpError(503, 'Máy chủ chưa cấu hình lưu trữ ảnh R2.');
  if (!file) throw new HttpError(400, 'Bạn chưa chọn ảnh đại diện.');
  const buffer = await encodeImage(file.buffer, { avatar: true });
  const { bucket, prefix } = r2Config();
  // Identity comes only from verified authentication, never multipart fields.
  const objectKey = [prefix, 'avatars', encodeURIComponent(user.id), `${randomUUID()}.webp`].filter(Boolean).join('/');
  const avatarUrl = publicImageUrl({ bucket, objectKey });
  if (!avatarUrl) throw new HttpError(503, 'Máy chủ chưa cấu hình URL công khai cho ảnh.');
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
  } catch { throw new HttpError(502, 'Không tải được ảnh đại diện lên R2.'); }
  try {
    const result = await authService.updateAvatar(token, avatarUrl);
    const updated = result.body?.user || result.body;
    if (updated?.id !== user.id || updated.user_metadata?.avatar_url !== avatarUrl) throw new HttpError(502, 'Chưa cập nhật được ảnh vào tài khoản.');
    return { user: updated, avatarUrl };
  } catch (error) {
    try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })); }
    catch { console.error('Could not remove an unreferenced avatar upload.'); }
    throw error;
  }
}

module.exports = { uploadAvatar };
