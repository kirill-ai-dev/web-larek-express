import 'dotenv/config';

/** Порт сервера из .env. Если не указан, используется 3000. */
export const PORT = Number(process.env.PORT ?? 3000);
/** Адрес MongoDB из .env. По умолчанию — локальная база weblarek. */
export const { DB_ADDRESS = 'mongodb://127.0.0.1:27017/weblarek' } = process.env;
