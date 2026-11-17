import { Router } from 'express';
import { createProduct, getProducts } from '../controllers/products';
import { validateProductBody } from '../middlewares/validation';

/** Маршруты /product: GET — список товаров, POST — создание после проверки данных. */
const router = Router();

router.get('/', getProducts);
router.post('/', validateProductBody, createProduct);

export default router;
