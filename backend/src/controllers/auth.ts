import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  BadRequestError, ConflictError, NotFoundError, UnauthorizedError,
} from '../errors';
import User, { IUser } from '../models/user';
import { comparePassword } from '../utils/password';
import {
  createTokens, getRefreshCookieMaxAge, refreshCookieOptions, verifyRefreshToken,
} from '../utils/tokens';

/** Отдаёт только имя и почту, access-токен и недоступную JavaScript refresh-cookie. */
const sendSession = (
  res: Response,
  user: IUser,
  tokens: ReturnType<typeof createTokens>,
  status = 200,
) => {
  res.cookie('refreshToken', tokens.refreshToken, {
    ...refreshCookieOptions,
    maxAge: getRefreshCookieMaxAge(),
  });
  res.status(status).send({
    user: { email: user.email, name: user.name },
    success: true,
    accessToken: tokens.accessToken,
  });
};

/** Извлекает ID из refresh-cookie. При выходе отдельно проверяет корректность ID. */
const readRefreshToken = (req: Request, isLogout = false) => {
  const token = req.cookies?.refreshToken;
  if (typeof token !== 'string' || !token) {
    throw new UnauthorizedError('Не передан refresh-токен');
  }
  const userId = verifyRefreshToken(token);
  if (!/^[a-f\d]{24}$/i.test(userId)) {
    if (isLogout) {
      throw new BadRequestError('Некорректный ID пользователя');
    }
    throw new UnauthorizedError('Некорректный ID в токене');
  }
  return { userId, token };
};

/** Создаёт пользователя, сохраняет refresh-токен и сразу открывает сессию. */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;
    const _id = new mongoose.Types.ObjectId();
    const tokens = createTokens(_id.toString());
    const user = await User.create({
      _id, name, email, password, tokens: [{ token: tokens.refreshToken }],
    });
    sendSession(res, user, tokens, 201);
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      next(new BadRequestError('Ошибка валидации данных при регистрации'));
    } else if (error instanceof Error && error.message.includes('E11000')) {
      next(new ConflictError('Пользователь с таким email уже существует'));
    } else {
      next(error);
    }
  }
};

/** Сравнивает пароль с хешем и добавляет новую сессию, сохраняя остальные. */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await comparePassword(password, user.password))) {
      throw new UnauthorizedError('Неправильные email или пароль');
    }
    const tokens = createTokens(user._id.toString());
    const updated = await User.findByIdAndUpdate(user._id, {
      $push: { tokens: { token: tokens.refreshToken } },
    }, { runValidators: true, new: true });
    if (!updated) {
      throw new NotFoundError('Пользователь не найден');
    }
    sendSession(res, user, tokens);
  } catch (error) {
    next(error);
  }
};

/** Возвращает имя и email пользователя из проверенного access-токена. */
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user?._id);
    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }
    res.send({ user: { email: user.email, name: user.name }, success: true });
  } catch (error) {
    next(error);
  }
};

/** Заменяет refresh-токен. Если пользователь удалён, возвращает 404, если сессия закрыта — 401. */
export const refreshAccessToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, token } = readRefreshToken(req);
    const tokens = createTokens(userId);
    const user = await User.findOneAndUpdate({ _id: userId, 'tokens.token': token }, {
      $set: { 'tokens.$.token': tokens.refreshToken },
    }, { new: true, runValidators: true });
    if (!user) {
      if (!(await User.exists({ _id: userId }))) {
        throw new NotFoundError('Пользователь не найден');
      }
      throw new UnauthorizedError('Сессия не найдена или уже завершена');
    }
    sendSession(res, user, tokens);
  } catch (error) {
    next(error);
  }
};

/** Удаляет текущий refresh-токен из базы и отправляет cookie с истекшим сроком. */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, token } = readRefreshToken(req, true);
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }
    const result = await User.updateOne({ _id: userId, 'tokens.token': token }, {
      $pull: { tokens: { token } },
    }, { runValidators: true });
    if (result.modifiedCount === 0) {
      throw new UnauthorizedError('Сессия уже завершена');
    }
    res.clearCookie('refreshToken', refreshCookieOptions);
    res.send({ success: true });
  } catch (error) {
    next(error);
  }
};
