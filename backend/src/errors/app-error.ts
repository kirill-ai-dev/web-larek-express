/** Общая основа ошибок приложения: хранит сообщение и HTTP-код ответа. */
export default class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
