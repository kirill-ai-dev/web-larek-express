import AppError from './app-error';

/** Ошибка 400: в запросе переданы некорректные данные. */
export default class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}
