import AppError from './app-error';

/** Ошибка 404: запрошенный маршрут не найден. */
export default class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}
