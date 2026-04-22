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

// ══ Avatar uploads (API layer) ══
// Riêng uploadAvatar cho mobile: 5MB, webp-aware, filename theo userId, filter trả
// error có statusCode/code để errorHandler map thẳng ra INVALID_FILE_TYPE.
const avatarDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const avatarStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, avatarDir);
  },
  filename(req, file, cb) {
    const ext = MIME_TO_EXT[file.mimetype] || 'bin';
    const userId = (req as any).user?.id ?? 'anon';
    cb(null, `${userId}-${Date.now()}.${ext}`);
  },
});

function avatarFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (AVATAR_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err: any = new Error('Chỉ cho phép file ảnh (jpg, png, webp)');
    err.statusCode = 400;
    err.code = 'INVALID_FILE_TYPE';
    cb(err);
  }
}

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: avatarFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ══ Payment method logo uploads (admin panel) ══
const paymentLogoDir = path.join(process.cwd(), 'public', 'uploads', 'payment-methods');
if (!fs.existsSync(paymentLogoDir)) {
  fs.mkdirSync(paymentLogoDir, { recursive: true });
}

const paymentLogoStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, paymentLogoDir);
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const uploadPaymentLogo = multer({
  storage: paymentLogoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});
