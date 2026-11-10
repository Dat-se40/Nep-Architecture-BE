const { z } = require('zod');

const slug = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.');
const text = z.string().trim().min(1).max(120);
const publication = z.enum(['draft', 'published', 'archived']);
const imageIds = z.array(z.string().refine(value => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n, 'ID ảnh không hợp lệ.')).max(30).refine(ids => new Set(ids).size === ids.length, 'Ảnh không được lặp lại.');

const projectFields = {
  name: z.string().trim().min(2).max(200),
  creatorId: text,
  type: text,
  style: text,
  city: text,
  area: z.number().finite().positive().max(100000000).nullable(),
  floors: z.number().int().positive().max(1000).nullable(),
  beds: z.number().int().min(0).max(10000).nullable(),
  year: z.number().int().min(1000).max(new Date().getFullYear() + 1).nullable(),
  story: z.string().trim().max(30000).nullable(),
  status: publication,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  imageIds,
};

const createProject = z.object({
  slug,
  ...projectFields,
  area: projectFields.area.optional(),
  floors: projectFields.floors.optional(),
  beds: projectFields.beds.optional(),
  year: projectFields.year.optional(),
  story: projectFields.story.optional(),
  status: publication.default('draft'),
  publishedAt: projectFields.publishedAt.optional(),
  imageIds: imageIds.default([]),
}).strict();

const updateProject = z.object(projectFields).partial().strict().refine(value => Object.keys(value).length > 0, 'Chưa có thông tin cần cập nhật.');

const queryValue = schema => z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, schema);

const queryFields = {
  q: z.string().trim().max(150).optional(),
  type: queryValue(text.optional()),
  style: queryValue(text.optional()),
  city: queryValue(text.optional()),
  creatorId: queryValue(text.optional()),
  area: queryValue(z.enum(['small', 'medium', 'large']).optional()),
  minArea: queryValue(z.coerce.number().finite().min(0).optional()),
  maxArea: queryValue(z.coerce.number().finite().positive().optional()),
  sort: queryValue(z.enum(['newest', 'area', 'name']).default('newest')),
  page: queryValue(z.coerce.number().int().min(1).max(10000).default(1)),
  pageSize: queryValue(z.coerce.number().int().min(1).max(50).default(6)),
};
const areaRange = value => value.minArea === undefined || value.maxArea === undefined || value.minArea <= value.maxArea;
const listProjects = z.object(queryFields).strict().refine(areaRange, 'Diện tích tối thiểu không được lớn hơn tối đa.');
const listAdminProjects = z.object({ ...queryFields, status: queryValue(publication.optional()) }).strict().refine(areaRange, 'Diện tích tối thiểu không được lớn hơn tối đa.');
const createCreator = z.object({ id: slug, name: z.string().trim().min(2).max(200), city: z.string().trim().max(120).optional() }).strict();

module.exports = { slug, createProject, updateProject, listProjects, listAdminProjects, createCreator };
