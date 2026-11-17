import AppError from './app-error';

/** Ошибка 500: произошёл непредусмотренный сбой на сервере. */
export default class InternalServerError extends AppError {
  constructor() {
    super('Ошибка сервера', 500);
  }
}
