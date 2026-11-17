/**
 * Точка входа: настраивает обработку запросов и ошибок,
 * подключается к MongoDB и после подключения запускает сервер.
 * @module app
 */
import { errors } from 'celebrate';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { DB_ADDRESS, PORT } from './config';
import { NotFoundError } from './errors';
import errorHandler from './middlewares/error-handler';
import { errorLogger, requestLogger } from './middlewares/logger';
import productRouter from './routes/products';
import orderRouter from './routes/orders';

const app = express();

app.use(requestLogger);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/product', productRouter);
app.use('/order', orderRouter);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError('Маршрут не найден'));
});

app.use(errorLogger);
app.use(errors());
app.use(errorHandler);

mongoose.connect(DB_ADDRESS)
  .then(() => {
    app.listen(PORT);
  })
  .catch((error: Error) => {
    process.stderr.write(`Не удалось подключиться к MongoDB: ${error.message}\n`);
    process.exit(1);
  });
