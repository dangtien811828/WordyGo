const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function imageFilter(req, file, cb) {
  if (['image/jpeg', 'image/png', 'image/gif'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép file ảnh (jpg, png, gif)'), false);
  }
}

function ebookFilter(req, file, cb) {
  if (['application/epub+zip', 'application/pdf', 'text/plain'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép file ebook (epub, pdf, txt)'), false);
  }
}

const LIMIT = { fileSize: 10 * 1024 * 1024 };

const uploadImage = multer({ storage, fileFilter: imageFilter, limits: LIMIT });
const uploadEbook = multer({ storage, fileFilter: ebookFilter, limits: LIMIT });

module.exports = { uploadImage, uploadEbook };
