import { Router } from 'express';
import createOrder from '../controllers/orders';
import { validateOrderBody } from '../middlewares/validation';

/** Маршрут POST /order: проверяет тело запроса и передаёт заказ контроллеру. */
const router = Router();

router.post('/', validateOrderBody, createOrder);

export default router;
