const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/require-admin');
const { uploadProjectImage } = require('../services/media');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 } });
const metadataSchema = z.object({ alt: z.string().trim().max(300).default(''), credit: z.string().trim().max(500).default('') }).strict();

function createMediaRouter(db, supabase, resolveRole) {
  const router = express.Router();
  router.post('/images', authenticate(supabase), requireAdmin(resolveRole), upload.single('image'), async (req, res) => {
    const image = await uploadProjectImage(db, req.file, metadataSchema.parse(req.body));
    res.status(201).json({ image });
  });
  return router;
}

module.exports = createMediaRouter;
