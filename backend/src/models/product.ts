import mongoose from 'mongoose';

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

const imageSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
}, { _id: false });

const productSchema = new mongoose.Schema<IProduct>({
  title: {
    type: String,
    required: true,
    unique: true,
    minlength: 2,
    maxlength: 30,
  },
  image: { type: imageSchema, required: true },
  category: { type: String, required: true },
  description: String,
  price: { type: Number, default: null },
}, { versionKey: false });

export default mongoose.model<IProduct>('product', productSchema);
