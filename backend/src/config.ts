import 'dotenv/config';
import path from 'path';

/** Порт сервера из .env. Если не указан, используется 3000. */
export const PORT = Number(process.env.PORT ?? 3000);
/** Адрес MongoDB из .env. По умолчанию — локальная база weblarek. */
export const { DB_ADDRESS = 'mongodb://127.0.0.1:27017/weblarek' } = process.env;
/** Секреты подписи access- и refresh-токенов из окружения. */
export const {
  AUTH_ACCESS_TOKEN_SECRET,
  AUTH_REFRESH_TOKEN_SECRET,
  AUTH_ACCESS_TOKEN_EXPIRY = '10m',
  AUTH_REFRESH_TOKEN_EXPIRY = '7d',
  ORIGIN_ALLOW = 'http://localhost:5173',
} = process.env;

/** Папка статики рядом с исходным или собранным кодом сервера. */
export const PUBLIC_DIRECTORY = path.resolve(__dirname, 'public');
/** Постоянная и временная папки из .env. Временная папка не раздаётся клиенту. */
export const UPLOAD_DIRECTORY = path.resolve(PUBLIC_DIRECTORY, process.env.UPLOAD_PATH || 'images');
export const TEMP_DIRECTORY = path.resolve(__dirname, '..', process.env.UPLOAD_PATH_TEMP || 'temp');
export const IMAGE_URL_PREFIX = '/images';
/** Принимаем одно изображение размером не больше 5 МБ. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
