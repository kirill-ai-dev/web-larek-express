import mongoose from 'mongoose';
import { isImageFileName, removeImage } from '../utils/files';

/** Поля товара. Цена null означает, что товар не продаётся. */
export interface IProduct {
  title: string;
  image: {
    fileName: string;
    originalName: string;
  };
  category: string;
  description?: string;
  price: number | null;
}

/** Путь к картинке на сервере и исходное имя файла. Оба поля обязательны. */
const imageSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: [true, 'Поле "fileName" должно быть заполнено'],
    validate: { validator: isImageFileName, message: 'Некорректный путь к изображению' },
  },
  originalName: { type: String, required: [true, 'Поле "originalName" должно быть заполнено'] },
}, { _id: false });

/** Правила хранения товара: уникальное название от 2 до 30 символов, картинка и категория. */
const productSchema = new mongoose.Schema<IProduct>({
  title: {
    type: String,
    required: [true, 'Поле "title" должно быть заполнено'],
    unique: true,
    minlength: [2, 'Минимальная длина поля "title" - 2'],
    maxlength: [30, 'Максимальная длина поля "title" - 30'],
  },
  image: { type: imageSchema, required: [true, 'Поле "image" должно быть заполнено'] },
  category: { type: String, required: [true, 'Поле "category" должно быть заполнено'] },
  description: String,
  price: { type: Number, default: null },
}, { versionKey: false });

/** Удаляет картинку после findByIdAndDelete/findOneAndDelete, если она больше не используется. */
productSchema.post('findOneAndDelete', async function cleanupImage(product) {
  if (product && !(await this.model.exists({ 'image.fileName': product.image.fileName }))) {
    await removeImage(product.image.fileName);
  }
});

/** Модель для чтения и сохранения товаров в коллекции products. */
export default mongoose.model<IProduct>('product', productSchema);
