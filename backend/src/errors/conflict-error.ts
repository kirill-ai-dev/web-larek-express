import AppError from './app-error';

/** Ошибка 409: товар с таким названием уже существует. */
export default class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}
