import AppError from './app-error';

/** Ошибка 401: пользователь не прошёл аутентификацию. */
export default class UnauthorizedError extends AppError {
  constructor(message = 'Необходима авторизация') {
    super(message, 401);
  }
}
