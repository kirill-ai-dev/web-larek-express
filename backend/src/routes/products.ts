import { Router } from 'express';
import {
  createProduct, deleteProduct, getProducts, updateProduct,
} from '../controllers/products';
import {
  validateAuthorization, validateProductBody, validateProductId, validateProductUpdateBody,
} from '../middlewares/validation';
import auth from '../middlewares/auth';

/** Каталог открыт всем. Изменение товаров требует access-токен до проверки данных. */
const router = Router();

router.get('/', getProducts);
router.post('/', validateAuthorization, auth, validateProductBody, createProduct);
router.patch(
  '/:productId',
  validateAuthorization,
  auth,
  validateProductId,
  validateProductUpdateBody,
  updateProduct,
);
router.delete('/:productId', validateAuthorization, auth, validateProductId, deleteProduct);

export default router;
