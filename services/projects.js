const HttpError = require('../lib/http-error');
const { publicImageUrl, r2Config, isR2Configured } = require('../configuration/r2');

const creatorSelect = { id: true, name: true, city: true, kind: true };
const includeProject = (detail = true) => ({
  creator: { select: creatorSelect },
  images: { orderBy: { position: 'asc' }, include: { image: true }, ...(detail ? {} : { take: 1 }) },
});

function projectDTO(project) {
  const images = project.images.map(({ image, position }) => ({
    id: image.id.toString(),
    position,
    url: publicImageUrl(image),
    alt: image.alt,
    credit: image.credit,
  }));

  return {
    slug: project.slug, name: project.name, creatorId: project.creatorId,
    type: project.type, style: project.style, city: project.city,
    area: project.area === null ? null : Number(project.area),
    floors: project.floors, beds: project.beds, year: project.year,
    story: project.story, status: project.status,
    publishedAt: project.publishedAt?.toISOString() || null,
    creator: project.creator, images, coverUrl: images[0]?.url || null,
  };
}

function publishedWhere() {
  return { status: 'published', publishedAt: { lte: new Date() } };
}

function projectWhere(query, admin = false) {
  const where = admin ? (query.status ? { status: query.status } : {}) : publishedWhere();
  for (const field of ['type', 'style', 'city', 'creatorId']) {
    if (query[field]) where[field] = query[field];
  }
  if (query.q) {
    where.OR = ['name', 'type', 'style', 'city'].map(field => ({ [field]: { contains: query.q, mode: 'insensitive' } }));
    where.OR.push({ creator: { name: { contains: query.q, mode: 'insensitive' } } });
  }
  const conditions = [];
  if (query.area === 'small') conditions.push({ area: { lt: 150 } });
  if (query.area === 'medium') conditions.push({ area: { gte: 150, lte: 250 } });
  if (query.area === 'large') conditions.push({ area: { gt: 250 } });
  if (query.minArea !== undefined) conditions.push({ area: { gte: query.minArea } });
  if (query.maxArea !== undefined) conditions.push({ area: { lte: query.maxArea } });
  if (conditions.length) where.AND = conditions;
  return where;
}

function createProjectService(db) {
  async function list(query, admin = false) {
    const where = projectWhere(query, admin);
    const firstOrder = query.sort === 'area' ? { area: { sort: 'asc', nulls: 'last' } }
      : query.sort === 'name' ? { name: 'asc' }
        : { publishedAt: { sort: 'desc', nulls: 'last' } };
    const [projects, total] = await db.$transaction([
      db.project.findMany({ where, include: includeProject(false), orderBy: [firstOrder, { slug: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.project.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items: projects.map(projectDTO), total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) };
  }

  async function detail(slug, admin = false) {
    const project = await db.project.findFirst({ where: { slug, ...(admin ? {} : publishedWhere()) }, include: includeProject() });
    if (!project) throw new HttpError(404, 'Không tìm thấy công trình.');
    return projectDTO(project);
  }

  async function checkReferences(tx, input) {
    if (input.creatorId && !await tx.creator.findUnique({ where: { id: input.creatorId }, select: { id: true } })) {
      throw new HttpError(400, 'Người thiết kế không tồn tại. Bạn tạo hoặc chọn lại người thiết kế.');
    }
    if (input.imageIds?.length) {
      const count = await tx.image.count({ where: { id: { in: input.imageIds.map(BigInt) }, bucket: r2Config().bucket } });
      if (count !== input.imageIds.length) throw new HttpError(400, 'Ảnh không tồn tại trong thư viện ảnh công khai.');
    }
  }

  function writeData(input, existing) {
    const { imageIds, ...data } = input;
    if (data.publishedAt !== undefined) data.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
    const status = data.status || existing?.status || 'draft';
    const publishedAt = data.publishedAt === undefined ? existing?.publishedAt : data.publishedAt;
    if (status === 'published' && !publishedAt) data.publishedAt = new Date();
    if (imageIds !== undefined) {
      data.images = {
        ...(existing ? { deleteMany: {} } : {}),
        create: imageIds.map((id, position) => ({ imageId: BigInt(id), position })),
      };
    }
    return data;
  }

  async function create(input) {
    return db.$transaction(async tx => {
      await checkReferences(tx, input);
      const project = await tx.project.create({ data: writeData(input), include: includeProject() });
      return projectDTO(project);
    });
  }

  async function update(slug, input) {
    return db.$transaction(async tx => {
      const existing = await tx.project.findUnique({ where: { slug } });
      if (!existing) throw new HttpError(404, 'Không tìm thấy công trình.');
      await checkReferences(tx, input);
      const project = await tx.project.update({ where: { slug }, data: writeData(input, existing), include: includeProject() });
      return projectDTO(project);
    });
  }

  async function archive(slug) {
    const project = await db.project.update({ where: { slug }, data: { status: 'archived' }, include: includeProject() });
    return projectDTO(project);
  }

  async function filters() {
    const rows = await db.project.findMany({ where: publishedWhere(), select: { type: true, style: true, city: true }, distinct: ['type', 'style', 'city'] });
    const values = field => [...new Set(rows.map(row => row[field]))].sort((a, b) => a.localeCompare(b, 'vi'));
    return { types: values('type'), styles: values('style'), cities: values('city') };
  }

  async function options() {
    const creators = await db.creator.findMany({ select: creatorSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return { creators, mediaConfigured: isR2Configured() };
  }

  async function createCreator(input) {
    return db.creator.create({ data: { ...input, tags: [] }, select: creatorSelect });
  }

  return { list, detail, create, update, archive, filters, options, createCreator };
}

module.exports = { createProjectService, projectDTO, projectWhere };
