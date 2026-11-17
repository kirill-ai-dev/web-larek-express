import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const deriveKey = promisify(scrypt);

/**
 * Хеширует пароль встроенной функцией scrypt со случайной солью.
 * В отличие от bcrypt, учитывает весь пароль, включая символы после 72-го байта.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
};

/** Сравнивает пароль с сохранённым хешем, не сравнивая сами строки паролей. */
export const comparePassword = async (password: string, stored: string): Promise<boolean> => {
  const [algorithm, salt, hash, extra] = stored.split(':');
  if (algorithm !== 'scrypt' || !/^[a-f\d]{32}$/i.test(salt)
    || !/^[a-f\d]{128}$/i.test(hash) || extra !== undefined) {
    return false;
  }
  const key = await deriveKey(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
};
