const express = require('express');
const validation = require('../validation/projects');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/require-admin');
const { createProjectService } = require('../services/projects');

function createPublicProjectsRouter(db) {
  const router = express.Router();
  const service = createProjectService(db);
  router.get('/', async (req, res) => res.json(await service.list(validation.listProjects.parse(req.query))));
  router.get('/filters', async (req, res) => res.json(await service.filters()));
  router.get('/:slug', async (req, res) => res.json({ project: await service.detail(validation.slug.parse(req.params.slug)) }));
  return router;
}

function createAdminProjectsRouter(db, supabase, resolveRole) {
  const router = express.Router();
  const service = createProjectService(db);
  router.use(authenticate(supabase), requireAdmin(resolveRole));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/projects', async (req, res) => res.json(await service.list(validation.listAdminProjects.parse(req.query), true)));
  router.get('/projects/options', async (req, res) => res.json(await service.options()));
  router.get('/projects/:slug', async (req, res) => res.json({ project: await service.detail(validation.slug.parse(req.params.slug), true) }));
  router.post('/projects', async (req, res) => res.status(201).json({ project: await service.create(validation.createProject.parse(req.body)) }));
  router.patch('/projects/:slug', async (req, res) => res.json({ project: await service.update(validation.slug.parse(req.params.slug), validation.updateProject.parse(req.body)) }));
  router.delete('/projects/:slug', async (req, res) => res.json({ project: await service.archive(validation.slug.parse(req.params.slug)) }));
  router.post('/creators', async (req, res) => res.status(201).json({ creator: await service.createCreator(validation.createCreator.parse(req.body)) }));
  return router;
}

module.exports = { createPublicProjectsRouter, createAdminProjectsRouter };
