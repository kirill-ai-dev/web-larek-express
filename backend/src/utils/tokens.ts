import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import ms from 'ms';
import {
  AUTH_ACCESS_TOKEN_EXPIRY, AUTH_ACCESS_TOKEN_SECRET,
  AUTH_REFRESH_TOKEN_EXPIRY, AUTH_REFRESH_TOKEN_SECRET,
} from '../config';
import { UnauthorizedError } from '../errors';
import { TokenPayload } from '../types/auth';

/** Проверяет, что секрет подписи задан в .env, не подставляя публичный ключ. */
const getSecret = (secret: string | undefined): string => {
  if (!secret) {
    throw new Error('В .env не задан секрет подписи JWT');
  }
  return secret;
};

/** Переводит срок из .env в миллисекунды для cookie и проверки настроек. */
const getLifetime = (value: string): number => {
  const lifetime = ms(value as ms.StringValue);
  if (!Number.isFinite(lifetime) || lifetime < 1000) {
    throw new Error('Некорректный срок действия JWT в .env');
  }
  return lifetime;
};

export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
  path: '/',
};

/**
 * Подписывает JWT. Метка nonce в заголовке различает токены, созданные в одну секунду.
 * В данные токена добавляем только _id; iat и exp заполняет библиотека.
 */
const signToken = (_id: string, secret: string | undefined, expiry: string): string => {
  const header = { alg: 'HS256', nonce: randomUUID() };
  return jwt.sign({ _id }, getSecret(secret), {
    algorithm: 'HS256',
    expiresIn: getLifetime(expiry) / 1000,
    header,
  });
};

/** Создаёт отдельные access- и refresh-токены с разными секретами и сроками. */
export const createTokens = (_id: string) => ({
  accessToken: signToken(_id, AUTH_ACCESS_TOKEN_SECRET, AUTH_ACCESS_TOKEN_EXPIRY),
  refreshToken: signToken(_id, AUTH_REFRESH_TOKEN_SECRET, AUTH_REFRESH_TOKEN_EXPIRY),
});

/** Проверяет подпись и срок токена. Просроченный или повреждённый токен даёт 401. */
const verifyToken = (token: string, secret: string | undefined): TokenPayload => {
  const key = getSecret(secret);
  try {
    const payload = jwt.verify(token, key, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload._id !== 'string'
      || typeof payload.exp !== 'number') {
      throw new UnauthorizedError();
    }
    return { ...payload, _id: payload._id, exp: payload.exp };
  } catch (_error) {
    throw new UnauthorizedError('Невалидный или просроченный токен');
  }
};

/** Возвращает проверенный payload access-токена для защищённых маршрутов. */
export const verifyAccessToken = (token: string) => verifyToken(token, AUTH_ACCESS_TOKEN_SECRET);
/** Читает ID из refresh-токена для обновления сессии и выхода. */
export const verifyRefreshToken = (token: string) => (
  verifyToken(token, AUTH_REFRESH_TOKEN_SECRET)._id
);
/** Срок cookie совпадает со сроком жизни refresh-токена. */
export const getRefreshCookieMaxAge = () => getLifetime(AUTH_REFRESH_TOKEN_EXPIRY);
