function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.name === 'ZodError') {
    return res.status(400).json({ error: 'Dữ liệu chưa hợp lệ.', fields: error.flatten().fieldErrors });
  }
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ.' });
  if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Tệp hoặc dữ liệu vượt quá kích thước cho phép.' });
  }
  if (error.name === 'MulterError') return res.status(400).json({ error: 'Chỉ gửi một ảnh trong trường image.' });
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (error.code === 'P2002') return res.status(409).json({ error: 'Slug hoặc mã này đã tồn tại.' });
  if (error.code === 'P2003') return res.status(400).json({ error: 'Người thiết kế hoặc ảnh được chọn không tồn tại.' });
  if (error.code === 'P2025') return res.status(404).json({ error: 'Không tìm thấy dữ liệu.' });

  console.error('Request failed:', error.code || error.name);
  return res.status(500).json({ error: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
}

module.exports = errorHandler;
