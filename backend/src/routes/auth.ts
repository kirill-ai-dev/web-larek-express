import cookieParser from 'cookie-parser';
import { Router } from 'express';
import {
  getCurrentUser, login, logout, refreshAccessToken, register,
} from '../controllers/auth';
import auth from '../middlewares/auth';
import {
  validateAuthorization, validateLoginBody, validateRefreshCookie, validateRegisterBody,
} from '../middlewares/validation';

/** Роуты регистрации, входа, обновления сессии, выхода и получения профиля. */
const authRouter = Router();

authRouter.use(cookieParser());
authRouter.post('/register', validateRegisterBody, register);
authRouter.post('/login', validateLoginBody, login);
authRouter.get('/token', validateRefreshCookie, refreshAccessToken);
authRouter.get('/logout', validateRefreshCookie, logout);
authRouter.get('/user', validateAuthorization, auth, getCurrentUser);

export default authRouter;
