import AppError from './app-error';

export default class InternalServerError extends AppError {
  constructor() {
    super('Ошибка сервера', 500);
  }
}
