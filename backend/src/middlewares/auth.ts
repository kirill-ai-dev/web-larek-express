import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors';
import { verifyAccessToken } from '../utils/tokens';

/** Проверяет Bearer-токен и передаёт ID пользователя следующему обработчику. */
const auth = (req: Request, res: Response, next: NextFunction) => {
  const match = req.headers.authorization?.match(/^Bearer (\S+)$/i);
  if (!match) {
    next(new UnauthorizedError());
    return;
  }
  try {
    res.locals.userId = verifyAccessToken(match[1]);
    if (!/^[a-f\d]{24}$/i.test(res.locals.userId)) {
      throw new UnauthorizedError('Некорректный ID в токене');
    }
    next();
  } catch (error) {
    next(error);
  }
};

export default auth;
