import expressWinston from 'express-winston';
import path from 'path';
import winston from 'winston';

/** Записывает каждый запрос и результат ответа в request.log в формате JSON. */
export const requestLogger = expressWinston.logger({
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../../request.log') }),
  ],
  format: winston.format.json(),
});

/** Записывает ошибки из next(error) в error.log перед отправкой ответа клиенту. */
export const errorLogger = expressWinston.errorLogger({
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../../error.log') }),
  ],
  format: winston.format.json(),
});
