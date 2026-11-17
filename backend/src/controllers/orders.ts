import { faker } from '@faker-js/faker';
import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import validator from 'validator';
import { BadRequestError } from '../errors';
import Product from '../models/product';

const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  const {
    payment, email, phone, address, total, items,
  } = req.body ?? {};

  if (
    !['card', 'online'].includes(payment)
    || typeof email !== 'string' || !validator.isEmail(email)
    || typeof phone !== 'string' || !phone.trim()
    || typeof address !== 'string' || !address.trim()
    || typeof total !== 'number' || !Number.isFinite(total)
    || !Array.isArray(items) || items.length === 0
    || !items.every((id: unknown) => typeof id === 'string' && mongoose.isObjectIdOrHexString(id))
  ) {
    next(new BadRequestError('Ошибка валидации данных при оформлении заказа'));
    return;
  }

  try {
    const products = await Product.find({ _id: { $in: items } });
    const productsById = new Map(products.map((product) => [product._id.toString(), product]));
    // Считаем по переданным позициям, чтобы одинаковые ID не терялись при запросе $in.
    const missingId = items.find((id: string) => !productsById.has(id.toLowerCase()));
    if (missingId) {
      next(new BadRequestError(`Товар с id ${missingId} не найден`));
      return;
    }

    const unavailable = products.find((product) => product.price === null);
    if (unavailable) {
      next(new BadRequestError(`Товар с id ${unavailable._id} не продается`));
      return;
    }

    const orderTotal = items.reduce((sum: number, id: string) => (
      sum + (productsById.get(id.toLowerCase())?.price ?? 0)
    ), 0);

    if (orderTotal !== total) {
      next(new BadRequestError('Неверная сумма заказа'));
      return;
    }

    res.send({ id: faker.string.uuid(), total: orderTotal });
  } catch (error) {
    next(error);
  }
};

export default createOrder;
