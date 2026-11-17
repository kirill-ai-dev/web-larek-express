import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import multer from 'multer';
import { MAX_FILE_SIZE, TEMP_DIRECTORY } from '../config';
import { BadRequestError } from '../errors';

const imageExtensions: Record<string, string> = {
  'image/png': '.png',
  'image/jpg': '.jpg',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

/** Принимает одно изображение из разрешённого списка до 5 МБ. */
const fileMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      mkdir(TEMP_DIRECTORY, { recursive: true })
        .then(() => callback(null, TEMP_DIRECTORY))
        .catch((error: Error) => callback(error, TEMP_DIRECTORY));
    },
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${imageExtensions[file.mimetype]}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => {
    if (!Object.prototype.hasOwnProperty.call(imageExtensions, file.mimetype)) {
      callback(new BadRequestError('Разрешены PNG, JPG, JPEG, GIF и SVG'));
      return;
    }
    callback(null, true);
  },
});

export default fileMiddleware;
