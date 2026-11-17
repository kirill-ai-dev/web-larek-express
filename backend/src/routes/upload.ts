import { Router } from 'express';
import uploadFile from '../controllers/upload';
import fileMiddleware from '../middlewares/file';
import auth from '../middlewares/auth';
import { validateAuthorization } from '../middlewares/validation';

/** Проверяет access-токен до сохранения единственного файла из поля file. */
const uploadRouter = Router();
uploadRouter.post('/', validateAuthorization, auth, fileMiddleware.single('file'), uploadFile);

export default uploadRouter;
