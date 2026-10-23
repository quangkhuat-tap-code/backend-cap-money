const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || '.jpg';
    cb(null, `img_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

const limits = { fileSize: 5 * 1024 * 1024, files: 1 };

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(400, 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP'));
  }
};

const upload = multer({ storage, limits, fileFilter });

function uploadSingleImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Ảnh vượt quá 5MB',
        data: null
      });
    }

    if (err instanceof AppError || (err && err.status)) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        data: null
      });
    }

    return next(err);
  });
}

module.exports = {
  uploadSingleImage,
  UPLOAD_DIR
};
