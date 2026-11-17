import { celebrate, Joi, Segments } from 'celebrate';

/** Проверяет поля нового товара до контроллера. При нарушении схемы возвращается 400. */
export const validateProductBody = celebrate({
  [Segments.BODY]: Joi.object({
    title: Joi.string().min(2).max(30).required(),
    image: Joi.object({
      fileName: Joi.string().required(),
      originalName: Joi.string().required(),
    }).required(),
    category: Joi.string().required(),
    description: Joi.string().allow(''),
    price: Joi.number().allow(null),
  }).required(),
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
