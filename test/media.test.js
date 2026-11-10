const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const { uploadProjectImage } = require('../services/media');

test('uploaded images are decoded, converted to WebP and recorded with a string ID', async () => {
  const original = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#eee' } }).png().toBuffer();
  const commands = [];
  const image = await uploadProjectImage({ image: { create: async ({ data }) => ({ id: 1n, ...data }) } },
    { buffer: original }, { alt: 'Ảnh công trình', credit: 'Nép' }, { send: async command => { commands.push(command); } });
  assert.equal(image.id, '1');
  assert.equal(image.alt, 'Ảnh công trình');
  assert.equal(commands[0].input.ContentType, 'image/webp');
  assert.equal((await sharp(commands[0].input.Body).metadata()).format, 'webp');
});

test('fake image files never reach object storage', async () => {
  let uploaded = false;
  await assert.rejects(uploadProjectImage({}, { buffer: Buffer.from('not an image') }, {}, {
    send: async () => { uploaded = true; },
  }), error => error.status === 400);
  assert.equal(uploaded, false);
});

test('folder prefixes are part of the object key, not the bucket name', async () => {
  const previous = process.env.R2_MEDIA_PREFIX;
  process.env.R2_MEDIA_PREFIX = '/nep-media/';
  try {
    const original = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
    const commands = [];
    let recorded;
    await uploadProjectImage({ image: { create: async ({ data }) => { recorded = data; return { id: 2n, ...data }; } } },
      { buffer: original }, {}, { send: async command => { commands.push(command); } });
    assert.match(commands[0].input.Key, /^nep-media\/projects\/[a-f0-9-]+\.webp$/);
    assert.equal(recorded.objectKey, commands[0].input.Key);
    assert.equal(recorded.bucket, commands[0].input.Bucket);
    assert.ok(!recorded.bucket.includes('/'));
  } finally {
    if (previous === undefined) delete process.env.R2_MEDIA_PREFIX;
    else process.env.R2_MEDIA_PREFIX = previous;
  }
});

test('an unconfigured media store returns a clear unavailable error', async () => {
  await assert.rejects(uploadProjectImage({}, null, {}, null), error => error.status === 503);
});

test('failed database writes attempt to remove the uploaded object', async () => {
  const original = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
  const commands = [];
  await assert.rejects(uploadProjectImage({ image: { create: async () => { throw new Error('DB unavailable'); } } },
    { buffer: original }, {}, { send: async command => { commands.push(command); } }), /DB unavailable/);
  assert.equal(commands.length, 2);
  assert.equal(commands[1].constructor.name, 'DeleteObjectCommand');
  assert.equal(commands[0].input.Key, commands[1].input.Key);
});
