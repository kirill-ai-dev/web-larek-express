import { NextFunction, Request, Response } from 'express';
import { AppError, BadRequestError, InternalServerError } from '../errors';

/**
 * Отправляет ошибку клиенту в формате { message } с нужным HTTP-кодом.
 * Для неизвестных ошибок возвращает 500 и скрывает внутренние подробности.
 */
const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  let appError = error instanceof AppError ? error : new InternalServerError();
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    appError = new BadRequestError('Некорректный JSON');
  }

  res.status(appError.statusCode).send({ message: appError.message });
};

export default errorHandler;
