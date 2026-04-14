import multer, { FileFilterCallback } from 'multer';
import type { Request } from 'express';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function imageFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (['image/jpeg', 'image/png', 'image/gif'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép file ảnh (jpg, png, gif)'));
  }
}

function ebookFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (['application/epub+zip', 'application/pdf', 'text/plain'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép file ebook (epub, pdf, txt)'));
  }
}

const LIMIT = { fileSize: 10 * 1024 * 1024 };

export const uploadImage = multer({ storage, fileFilter: imageFilter, limits: LIMIT });
export const uploadEbook = multer({ storage, fileFilter: ebookFilter, limits: LIMIT });
