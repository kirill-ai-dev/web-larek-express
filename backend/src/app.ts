import 'dotenv/config';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import { NotFoundError } from './errors';
import errorHandler from './middlewares/error-handler';
import productRouter from './routes/products';
import orderRouter from './routes/orders';

const app = express();
const port = 3000;
const { DB_ADDRESS = 'mongodb://127.0.0.1:27017/weblarek' } = process.env;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/product', productRouter);
app.use('/order', orderRouter);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError('Маршрут не найден'));
});

app.use(errorHandler);

mongoose.connect(DB_ADDRESS)
  .then(() => {
    app.listen(port);
  })
  .catch((error: Error) => {
    process.stderr.write(`Не удалось подключиться к MongoDB: ${error.message}\n`);
    process.exit(1);
  });
