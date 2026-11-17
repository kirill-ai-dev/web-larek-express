import { celebrate, Joi, Segments } from 'celebrate';
import { isImageFileName } from '../utils/files';

/** Данные картинки: локальный путь без переходов к другим файлам и исходное имя. */
const productImageSchema = Joi.object({
  fileName: Joi.string().custom((value: string, helpers) => (
    isImageFileName(value) ? value : helpers.error('any.invalid')
  )).required(),
  originalName: Joi.string().required(),
});

/** Преобразует цену из строки админки в число. Остальные поля проверяются строго. */
const productPriceSchema = Joi.number()
  .allow(null)
  .prefs({ convert: true });

/** Проверяет поля нового товара до контроллера. При нарушении схемы возвращается 400. */
export const validateProductBody = celebrate({
  [Segments.BODY]: Joi.object({
    title: Joi.string().min(2).max(30).required(),
    image: productImageSchema.required(),
    category: Joi.string().required(),
    description: Joi.string().allow(''),
    price: productPriceSchema,
  }).required(),
}, { convert: false });

/** Все поля обновления необязательны, но хотя бы одно должно быть передано. */
export const validateProductUpdateBody = celebrate({
  [Segments.BODY]: Joi.object({
    title: Joi.string().min(2).max(30),
    image: productImageSchema,
    category: Joi.string(),
    description: Joi.string().allow(''),
    price: productPriceSchema,
  }).min(1).required(),
}, { convert: false });

/** Проверяет ID товара из URL перед обновлением или удалением. */
export const validateProductId = celebrate({
  [Segments.PARAMS]: Joi.object({ productId: Joi.string().hex().length(24).required() }),
}, { convert: false });

/**
 * Проверяет контакты, способ оплаты, сумму и список ID товаров до контроллера.
 * Наличие товаров в базе и правильность суммы проверяет сам контроллер.
 */
export const validateOrderBody = celebrate({
  [Segments.BODY]: Joi.object({
    payment: Joi.string().valid('card', 'online').required(),
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    phone: Joi.string().pattern(/\S/).required(),
    address: Joi.string().pattern(/\S/).required(),
    total: Joi.number().required(),
    items: Joi.array().items(Joi.string().hex().length(24).required()).min(1).required(),
  }).required(),
}, { convert: false });

/** Проверяет обязательные email и пароль и необязательное имя при регистрации. */
export const validateRegisterBody = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(30),
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(6).required(),
  }).required(),
}, { convert: false });

/** Не позволяет передать вместо email и пароля числа или условия MongoDB. */
export const validateLoginBody = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().required(),
  }).required(),
}, { convert: false });

/** Проверяет тип refresh-cookie перед контроллером. Отсутствие cookie даёт 401. */
export const validateRefreshCookie = celebrate({
  [Segments.COOKIES]: Joi.object({ refreshToken: Joi.string().allow('') }).unknown(true),
}, { convert: false });

/** Проверяет тип заголовка авторизации; наличие и подпись проверяет auth. */
export const validateAuthorization = celebrate({
  [Segments.HEADERS]: Joi.object({ authorization: Joi.string().allow('') }).unknown(true),
}, { convert: false });
