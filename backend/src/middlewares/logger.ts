import expressWinston from 'express-winston';
import path from 'path';
import winston from 'winston';
import { AppError } from '../errors';

/** Записывает запрос и результат в JSON, исключая заголовки с токенами и cookie. */
export const requestLogger = expressWinston.logger({
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../../request.log') }),
  ],
  format: winston.format.json(),
  headerBlacklist: ['authorization', 'cookie', 'set-cookie'],
});

/** Записывает ошибки из next(error) в error.log перед отправкой ответа клиенту. */
export const errorLogger = expressWinston.errorLogger({
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../../error.log') }),
  ],
  format: winston.format.json(),
  headerBlacklist: ['authorization', 'cookie', 'set-cookie'],
  // Ошибки библиотек могут содержать пароль из запроса, поэтому не сохраняем их целиком.
  exceptionToMeta: (error) => ({
    name: error.name,
    message: error instanceof AppError ? error.message : 'Ошибка при обработке запроса',
  }),
});
