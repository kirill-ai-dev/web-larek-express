import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { BadRequestError, ConflictError } from '../errors';
import Product from '../models/product';

/** Возвращает все товары и их количество в формате { items, total }. */
export const getProducts = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await Product.find({});
    res.send({ items, total: items.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Сохраняет новый товар и возвращает его клиенту.
 * Ошибки данных и повтор названия передаёт общему обработчику через next.
 *
 * Исправление по результатам автотестов: при создании товара нужен статус 201.
 * Он означает, что сервер успешно создал новый ресурс.
 */
export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title, image, category, description, price,
    } = req.body ?? {};
    const product = await Product.create({
      title, image, category, description, price,
    });
    res.status(201).send(product);
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      next(new BadRequestError('Ошибка валидации данных при создании товара'));
    } else if (error instanceof Error && error.message.includes('E11000')) {
      next(new ConflictError('Товар с таким названием уже существует'));
    } else {
      next(error);
    }
  }
};
