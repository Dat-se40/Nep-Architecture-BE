const sharp = require('sharp');
const HttpError = require('../lib/http-error');

async function encodeImage(buffer, { avatar = false } = {}) {
  try {
    const image = sharp(buffer, { limitInputPixels: 40000000 });
    const info = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(info.format) || (info.pages || 1) > 1) throw new Error('Unsupported image');
    return await image.rotate().resize(avatar
      ? { width: 512, height: 512, fit: 'cover' }
      : { width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new HttpError(400, 'Ảnh không hợp lệ. Chọn ảnh JPG, PNG, WebP hoặc AVIF, tối đa 40 megapixel.');
  }
}

module.exports = { encodeImage };
