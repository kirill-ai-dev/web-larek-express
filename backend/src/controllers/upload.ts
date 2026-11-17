import { NextFunction, Request, Response } from 'express';
import { readFile, unlink } from 'fs/promises';
import { IMAGE_URL_PREFIX } from '../config';
import { BadRequestError } from '../errors';
import isSafeSvg from '../utils/svg';

/** Проверяет сигнатуру, чтобы одного заявленного MIME-типа было недостаточно. */
const checkImageSignature = async (file: { path: string; mimetype: string }): Promise<boolean> => {
  const content = await readFile(file.path);
  if (file.mimetype === 'image/png') {
    return content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
    return content.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  }
  if (file.mimetype === 'image/gif') {
    return content.subarray(0, 6).equals(Buffer.from('GIF89a'))
      || content.subarray(0, 6).equals(Buffer.from('GIF87a'));
  }
  return isSafeSvg(content.toString('utf8'));
};

/** Сохраняет загрузку во временной папке и возвращает данные для JSON товара. */
const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new BadRequestError('Не передан файл в поле file');
    }
    if (!(await checkImageSignature(req.file))) {
      await unlink(req.file.path);
      throw new BadRequestError('Содержимое файла не соответствует заявленному формату изображения');
    }
    res.send({
      fileName: `${IMAGE_URL_PREFIX}/${req.file.filename}`,
      originalName: req.file.originalname,
    });
  } catch (error) {
    next(error);
  }
};

export default uploadFile;
