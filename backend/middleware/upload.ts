import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Ensure uploads directories exist
for (const dir of ['prescriptions', 'medications', 'profiles']) {
  const full = path.join(UPLOADS_DIR, dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
  }
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG and WebP images are allowed'));
  }
};

const makeFilename = (_req: any, file: Express.Multer.File, cb: any) => {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, `${unique}${ext}`);
};

export const uploadPrescription = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOADS_DIR, 'prescriptions')),
    filename: makeFilename,
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter,
}).single('image');

export const uploadMedicationImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOADS_DIR, 'medications')),
    filename: makeFilename,
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter,
}).single('image');

export const uploadProfileImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(UPLOADS_DIR, 'profiles')),
    filename: makeFilename,
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter,
}).single('image');

export const UPLOADS_BASE = UPLOADS_DIR;
