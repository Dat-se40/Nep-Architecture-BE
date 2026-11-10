const { z } = require('zod');
const validation = require('../validation/projects');
const { version } = require('../package.json');

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties) });
const array = items => ({ type: 'array', items });
const nullableString = { type: ['string', 'null'] };
const bearer = [{ bearerAuth: [] }];
const jsonResponse = (description, schema) => ({ description, content: { 'application/json': { schema } } });
const errorResponse = description => jsonResponse(description, ref('Error'));
const errors = {
  400: errorResponse('Dữ liệu, tham số hoặc ảnh không hợp lệ.'),
  401: errorResponse('Thiếu access token, token sai hoặc hết hạn.'),
  403: errorResponse('Tài khoản không có quyền admin.'),
  404: errorResponse('Không tìm thấy công trình hoặc dữ liệu được yêu cầu.'),
  409: errorResponse('Slug hoặc mã người thiết kế đã tồn tại.'),
  413: errorResponse('JSON vượt quá 1 MB hoặc ảnh vượt quá 10 MiB.'),
  500: errorResponse('Máy chủ không thể xử lý yêu cầu.'),
  502: errorResponse('Không upload được ảnh lên R2.'),
  503: errorResponse('Dịch vụ xác thực, phân quyền hoặc lưu trữ ảnh chưa sẵn sàng.'),
};
const responses = (success, codes = []) => ({ ...success, ...Object.fromEntries([...codes, 500].map(code => [code, errors[code]])) });
const adminResponses = (success, codes = []) => responses(success, [401, 403, 503, ...codes]);
const body = (schema, example) => ({ required: true, content: { 'application/json': { schema, ...(example ? { example } : {}) } } });

function inputSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { io: 'input' });
  return jsonSchema;
}

const imageId = {
  type: 'string', pattern: '^[1-9][0-9]{0,18}$', examples: ['1'],
  description: 'ID ảnh dạng chuỗi số nguyên dương, tối đa 9223372036854775807.',
};
const createProject = inputSchema(validation.createProject);
const updateProject = { ...inputSchema(validation.updateProject), minProperties: 1 };
for (const schema of [createProject, updateProject]) {
  schema.properties.imageIds = { ...schema.properties.imageIds, items: imageId, uniqueItems: true, description: 'Tối đa 30 ID ảnh đã upload, không lặp. Thứ tự là thứ tự gallery; ảnh đầu làm bìa. Khi PATCH, thay toàn bộ gallery nếu gửi trường này.' };
  schema.properties.publishedAt.description = 'ISO 8601 có múi giờ hoặc null. Khi xuất bản mà chưa có thời gian, BE dùng thời điểm hiện tại. Ngày tương lai là hẹn đăng.';
}

const query = (name, schema, description) => ({ name, in: 'query', schema, description });
const listParameters = [
  query('q', { type: 'string', maxLength: 150 }, 'Tìm trong tên công trình, loại hình, phong cách, địa điểm và tên người thiết kế; không phân biệt hoa thường.'),
  ...['type', 'style', 'city', 'creatorId'].map(name => query(name, { type: 'string', minLength: 1, maxLength: 120 }, 'Lọc theo giá trị chính xác.')),
  query('area', { type: 'string', enum: ['small', 'medium', 'large'] }, 'small: dưới 150 m²; medium: 150–250 m²; large: trên 250 m².'),
  query('minArea', { type: 'number', minimum: 0 }, 'Diện tích tối thiểu, không lớn hơn maxArea.'),
  query('maxArea', { type: 'number', exclusiveMinimum: 0 }, 'Diện tích tối đa.'),
  query('sort', { type: 'string', enum: ['newest', 'area', 'name'], default: 'newest' }, 'Mới nhất trước, diện tích tăng dần hoặc tên tăng dần.'),
  query('page', { type: 'integer', minimum: 1, maximum: 10000, default: 1 }, 'Trang kết quả.'),
  query('pageSize', { type: 'integer', minimum: 1, maximum: 50, default: 6 }, 'Số công trình mỗi trang.'),
];
const slugParameter = { name: 'slug', in: 'path', required: true, schema: inputSchema(validation.slug), example: 'nha-ben-hien' };
const projectResponse = object({ project: ref('Project') });
const projectExample = {
  slug: 'nha-ben-hien', name: 'Nhà bên hiên', creatorId: 'nep-studio',
  type: 'Nhà phố', style: 'Hiện đại', city: 'Đà Lạt', area: 180, floors: 2, beds: 3,
  year: 2025, story: 'Một ngôi nhà đón ánh sáng và gió tự nhiên.', status: 'draft', imageIds: [],
};

module.exports = {
  openapi: '3.1.0',
  info: {
    title: 'Nép Architecture API', version,
    description: 'API Express/Prisma cho thư viện công trình.\n\nĐăng nhập ở FE qua Supabase, sau đó nhập **access_token của phiên đăng nhập** vào Bearer Auth để thử API được bảo vệ. Không dùng publishable key, secret key hoặc Google Client Secret làm Bearer token. Quyền admin được BE xác minh theo UUID trong danh sách riêng.\n\nCác thao tác tạo, sửa, gỡ và upload chạy trên dữ liệu thật của server đang chọn.',
  },
  servers: [{ url: '/', description: 'Server đang mở tài liệu' }],
  tags: [
    { name: 'Health', description: 'Trạng thái ứng dụng.' },
    { name: 'Auth', description: 'Thông tin người dùng và quyền đã xác minh.' },
    { name: 'Projects', description: 'Thư viện công khai: chỉ công trình published đã đến thời điểm đăng.' },
    { name: 'Admin projects', description: 'Chỉ admin: quản lý công trình và người thiết kế.' },
    { name: 'Media', description: 'Chỉ admin: upload ảnh công trình lên Cloudflare R2.' },
  ],
  paths: {
    '/': {
      get: { tags: ['Health'], operationId: 'getHealth', summary: 'Kiểm tra ứng dụng', responses: responses({ 200: jsonResponse('Ứng dụng đang chạy.', object({ status: { type: 'string', const: 'ok' } })) }) },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'], operationId: 'getCurrentUser', summary: 'Thông tin tài khoản hiện tại', security: bearer,
        responses: responses({ 200: jsonResponse('Danh tính Supabase và role do BE tính.', object({ user: object({ id: { type: 'string', format: 'uuid' }, email: nullableString, role: { type: 'string', enum: ['admin', 'member'] } }) })) }, [401, 503]),
      },
    },
    '/api/projects': {
      get: {
        tags: ['Projects'], operationId: 'listProjects', summary: 'Danh sách công trình công khai',
        description: 'Có tìm kiếm, bộ lọc và phân trang. Giá trị query rỗng được bỏ qua. Mỗi công trình trong danh sách chỉ kèm ảnh bìa; mở chi tiết để lấy toàn bộ gallery.',
        parameters: listParameters, responses: responses({ 200: jsonResponse('Kết quả phân trang; có thể rỗng.', ref('ProjectList')) }, [400]),
      },
    },
    '/api/projects/filters': {
      get: {
        tags: ['Projects'], operationId: 'getProjectFilters', summary: 'Các giá trị bộ lọc đang có',
        responses: responses({ 200: jsonResponse('Giá trị từ công trình công khai đã đến ngày đăng.', object({ types: array({ type: 'string' }), styles: array({ type: 'string' }), cities: array({ type: 'string' }) })) }),
      },
    },
    '/api/projects/{slug}': {
      parameters: [slugParameter],
      get: { tags: ['Projects'], operationId: 'getProject', summary: 'Chi tiết công trình công khai', description: 'Bản nháp, đã gỡ và hẹn đăng chưa tới ngày đều trả 404.', responses: responses({ 200: jsonResponse('Công trình và toàn bộ gallery theo thứ tự.', projectResponse) }, [400, 404]) },
    },
    '/api/admin/projects': {
      get: {
        tags: ['Admin projects'], operationId: 'listAdminProjects', summary: 'Danh sách quản trị', security: bearer,
        parameters: [...listParameters, query('status', { type: 'string', enum: ['draft', 'published', 'archived'] }, 'Không gửi để lấy tất cả trạng thái, bao gồm hẹn đăng.')],
        responses: adminResponses({ 200: jsonResponse('Danh sách quản trị phân trang, mỗi mục kèm ảnh bìa.', ref('ProjectList')) }, [400]),
      },
      post: {
        tags: ['Admin projects'], operationId: 'createProject', summary: 'Tạo công trình', security: bearer,
        description: 'Cần creatorId đã tồn tại. Có thể tạo người thiết kế qua POST /api/admin/creators. Slug không thay đổi sau khi tạo.',
        requestBody: body(ref('CreateProject'), projectExample),
        responses: adminResponses({ 201: jsonResponse('Công trình vừa tạo.', projectResponse) }, [400, 409, 413]),
      },
    },
    '/api/admin/projects/options': {
      get: {
        tags: ['Admin projects'], operationId: 'getProjectOptions', summary: 'Dữ liệu cho form công trình', security: bearer,
        responses: adminResponses({ 200: jsonResponse('Người thiết kế và trạng thái cấu hình R2; mediaConfigured không phải kiểm tra kết nối trực tiếp.', object({ creators: array(ref('Creator')), mediaConfigured: { type: 'boolean' } })) }),
      },
    },
    '/api/admin/projects/{slug}': {
      parameters: [slugParameter],
      get: { tags: ['Admin projects'], operationId: 'getAdminProject', summary: 'Chi tiết quản trị, mọi trạng thái', security: bearer, responses: adminResponses({ 200: jsonResponse('Công trình và toàn bộ gallery.', projectResponse) }, [400, 404]) },
      patch: {
        tags: ['Admin projects'], operationId: 'updateProject', summary: 'Cập nhật công trình', security: bearer,
        description: 'Gửi ít nhất một trường. Không gửi slug. Trường bị bỏ qua giữ giá trị hiện tại; imageIds nếu được gửi sẽ thay toàn bộ gallery.',
        requestBody: body(ref('UpdateProject'), { name: 'Nhà bên hiên — cập nhật', status: 'published' }),
        responses: adminResponses({ 200: jsonResponse('Công trình sau cập nhật.', projectResponse) }, [400, 404, 413]),
      },
      delete: {
        tags: ['Admin projects'], operationId: 'archiveProject', summary: 'Gỡ công trình khỏi thư viện', security: bearer,
        description: 'Chuyển trạng thái thành archived, giữ bản ghi, ảnh và các liên kết. Có thể đăng lại bằng PATCH status=published.',
        responses: adminResponses({ 200: jsonResponse('Công trình đã chuyển sang archived.', projectResponse) }, [400, 404]),
      },
    },
    '/api/admin/creators': {
      post: {
        tags: ['Admin projects'], operationId: 'createCreator', summary: 'Tạo người thiết kế / studio', security: bearer,
        requestBody: body(ref('CreateCreator'), { id: 'nep-studio', name: 'Nép Studio', city: 'Đà Lạt' }),
        responses: adminResponses({ 201: jsonResponse('Người thiết kế vừa tạo.', object({ creator: ref('Creator') })) }, [400, 409, 413]),
      },
    },
    '/api/admin/media/images': {
      post: {
        tags: ['Media'], operationId: 'uploadProjectImage', summary: 'Upload ảnh công trình', security: bearer,
        description: 'Gửi một ảnh JPG, PNG, WebP hoặc AVIF, tối đa 10 MiB và 40 megapixel; không nhận ảnh động. BE xoay ảnh, chuyển WebP và thu gọn trong 2560×2560 trước khi lưu R2. Dùng ID trả về trong imageIds khi tạo/sửa công trình. Upload thành công chưa tự gắn ảnh vào công trình.',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', required: ['image'], additionalProperties: false, properties: { image: { type: 'string', format: 'binary', description: 'Một file ảnh, tối đa 10 MiB.' }, alt: { type: 'string', maxLength: 300, default: '' }, credit: { type: 'string', maxLength: 500, default: '' } } } } },
        },
        responses: adminResponses({ 201: jsonResponse('ID ảnh và URL công khai.', object({ image: ref('UploadedImage') })) }, [400, 413, 502]),
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Nhập access_token của phiên Supabase sau khi đăng nhập ở FE. Scalar tự thêm tiền tố Bearer.' } },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' }, fields: { type: 'object', additionalProperties: array({ type: 'string' }), description: 'Lỗi theo tên trường khi Zod kiểm tra dữ liệu.' } } },
      CreateProject: createProject,
      UpdateProject: updateProject,
      CreateCreator: inputSchema(validation.createCreator),
      Creator: object({ id: { type: 'string' }, name: { type: 'string' }, city: nullableString, kind: nullableString }),
      UploadedImage: object({ id: imageId, url: { ...nullableString, format: 'uri' }, alt: { type: 'string' }, credit: { type: 'string' } }),
      ProjectImage: { allOf: [ref('UploadedImage'), object({ position: { type: 'integer', minimum: 0 } })] },
      Project: object({
        slug: inputSchema(validation.slug), name: { type: 'string' }, creatorId: { type: 'string' }, type: { type: 'string' }, style: { type: 'string' }, city: { type: 'string' },
        area: { type: ['number', 'null'] }, floors: { type: ['integer', 'null'] }, beds: { type: ['integer', 'null'] }, year: { type: ['integer', 'null'] },
        story: nullableString, status: { type: 'string', enum: ['draft', 'published', 'archived'] }, publishedAt: { ...nullableString, format: 'date-time' },
        creator: ref('Creator'), images: array(ref('ProjectImage')), coverUrl: { ...nullableString, format: 'uri' },
      }),
      ProjectList: object({ items: array(ref('Project')), total: { type: 'integer', minimum: 0 }, page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 50 }, totalPages: { type: 'integer', minimum: 0 } }),
    },
  },
};
