import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import Product from '../models/product';
import lockProduct from '../utils/product-lock';
import {
  finishImage, PreparedImage, prepareImage, removeImage,
} from '../utils/files';

/** Удаляет постоянную копию, только если на неё уже не ссылаются товары. */
const removeUnusedImage = async (fileName: string) => {
  if (!(await Product.exists({ 'image.fileName': fileName }))) {
    await removeImage(fileName);
  }
};

/** Переводит ошибки модели в знакомые API-коды, остальные передаёт общему обработчику. */
const handleProductError = (error: unknown, next: NextFunction) => {
  if (error instanceof mongoose.Error.ValidationError
    || error instanceof mongoose.Error.CastError) {
    next(new BadRequestError('Ошибка валидации данных товара'));
  } else if (error instanceof Error && error.message.includes('E11000')) {
    next(new ConflictError('Товар с таким названием уже существует'));
  } else {
    next(error);
  }
};

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
 * Сначала копирует загрузку в images; после записи товара удаляет временный оригинал.
 * Ошибки данных и повтор названия передаёт общему обработчику через next.
 *
 * Исправление по результатам автотестов: при создании товара нужен статус 201.
 * Он означает, что сервер успешно создал новый ресурс.
 */
export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  let prepared: PreparedImage | undefined;
  let saved = false;
  try {
    const {
      title, image, category, description, price,
    } = req.body ?? {};
    const product = new Product({
      title, image, category, description, price,
    });
    prepared = await prepareImage(image.fileName);
    await product.save();
    saved = true;
    await finishImage(prepared);
    res.status(201).send(product);
  } catch (error) {
    try {
      if (prepared?.copied && !saved) await removeUnusedImage(prepared.fileName);
      handleProductError(error, next);
    } catch (cleanupError) {
      next(cleanupError);
    }
  }
};

/** Обновляет только переданные поля, переносит новую картинку и убирает старую. */
export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  let prepared: PreparedImage | undefined;
  let saved = false;
  const release = await lockProduct(req.params.productId);
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) throw new NotFoundError('Товар не найден');
    const {
      title, image, category, description, price,
    } = req.body;
    const updates = {
      title, image, category, description, price,
    };
    const definedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );
    if (image !== undefined) prepared = await prepareImage(image.fileName);
    const updated = await Product.findByIdAndUpdate(req.params.productId, {
      $set: definedUpdates,
    }, { runValidators: true, new: true });
    if (!updated) throw new NotFoundError('Товар не найден');
    saved = true;
    if (prepared) await finishImage(prepared);
    if (product.image.fileName !== updated.image.fileName) {
      await removeUnusedImage(product.image.fileName);
    }
    res.send(updated);
  } catch (error) {
    try {
      if (prepared?.copied && !saved) await removeUnusedImage(prepared.fileName);
      handleProductError(error, next);
    } catch (cleanupError) {
      next(cleanupError);
    }
  } finally {
    release();
  }
};

/** Удаляет товар. Хук модели очищает связанную картинку до отправки ответа. */
export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  const release = await lockProduct(req.params.productId);
  try {
    const product = await Product.findByIdAndDelete(req.params.productId);
    if (!product) throw new NotFoundError('Товар не найден');
    res.send(product);
  } catch (error) {
    handleProductError(error, next);
  } finally {
    release();
  }
};
