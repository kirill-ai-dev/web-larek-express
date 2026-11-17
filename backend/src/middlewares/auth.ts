import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors';
import { verifyAccessToken } from '../utils/tokens';

/** Записывает проверенный payload в req.user. Без подходящего access-токена отдаёт 401. */
const auth = (req: Request, _res: Response, next: NextFunction) => {
  const match = req.headers.authorization?.match(/^Bearer (\S+)$/i);
  if (!match) {
    next(new UnauthorizedError());
    return;
  }
  try {
    const payload = verifyAccessToken(match[1]);
    if (!/^[a-f\d]{24}$/i.test(payload._id)) {
      throw new UnauthorizedError('Некорректный ID в токене');
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
};

export default auth;
