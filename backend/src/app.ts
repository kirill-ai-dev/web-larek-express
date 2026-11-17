/**
 * Точка входа: настраивает обработку запросов и ошибок,
 * подключается к MongoDB и после подключения запускает сервер.
 * @module app
 */
import { errors } from 'celebrate';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  DB_ADDRESS, IMAGE_URL_PREFIX, ORIGIN_ALLOW, PORT, PUBLIC_DIRECTORY, UPLOAD_DIRECTORY,
} from './config';
import { NotFoundError } from './errors';
import errorHandler from './middlewares/error-handler';
import { errorLogger, requestLogger } from './middlewares/logger';
import productRouter from './routes/products';
import orderRouter from './routes/orders';
import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import startTemporaryFilesCleanup from './utils/cleanup';

const app = express();

app.use(requestLogger);
app.use(cors({ origin: ORIGIN_ALLOW, credentials: true }));
app.use(express.json());
app.use(IMAGE_URL_PREFIX, express.static(UPLOAD_DIRECTORY));
app.use(express.static(PUBLIC_DIRECTORY));
app.use('/product', productRouter);
app.use('/order', orderRouter);
app.use('/auth', authRouter);
app.use('/upload', uploadRouter);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError('Маршрут не найден'));
});

app.use(errorLogger);
app.use(errors());
app.use(errorHandler);

mongoose.connect(DB_ADDRESS)
  .then(() => {
    startTemporaryFilesCleanup();
    app.listen(PORT);
  })
  .catch((error: Error) => {
    process.stderr.write(`Не удалось подключиться к MongoDB: ${error.message}\n`);
    process.exit(1);
  });
