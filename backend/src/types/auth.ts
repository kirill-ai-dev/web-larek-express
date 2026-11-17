/** Проверенные данные JWT, доступные обработчикам защищённых маршрутов. */
export interface TokenPayload {
  _id: string;
  exp: number;
  iat?: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload;
  }
}
