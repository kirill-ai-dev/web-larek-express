import { Joi } from 'celebrate';
import mongoose from 'mongoose';
import { hashPassword } from '../utils/password';

/** Данные пользователя и его активные сессии. Пароль хранится в виде хеша. */
export interface IUser {
  name: string;
  email: string;
  password: string;
  tokens: { token: string }[];
}

const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
}, { _id: false });

/** Проверяет данные и скрывает пароль и сессии при обычном поиске пользователя. */
const userSchema = new mongoose.Schema<IUser>({
  name: {
    type: String,
    minlength: [2, 'Минимальная длина имени — 2 символа'],
    maxlength: [30, 'Максимальная длина имени — 30 символов'],
    default: 'Ё-мое',
  },
  email: {
    type: String,
    required: [true, 'Поле "email" должно быть заполнено'],
    unique: true,
    validate: {
      validator: (email: string) => !Joi.string().email({ tlds: { allow: false } })
        .validate(email).error,
      message: 'Некорректный email',
    },
  },
  password: {
    type: String,
    required: [true, 'Поле "password" должно быть заполнено'],
    minlength: [6, 'Минимальная длина пароля — 6 символов'],
    select: false,
  },
  tokens: { type: [tokenSchema], default: [], select: false },
}, { versionKey: false });

/** Хеширует новый пароль после валидации, в том числе при сохранении без HTTP. */
userSchema.pre('save', async function hashUserPassword() {
  if (this.isModified('password')) {
    this.password = await hashPassword(this.password);
  }
});

export default mongoose.model<IUser>('user', userSchema);
