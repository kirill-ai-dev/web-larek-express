import 'dotenv/config';

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
