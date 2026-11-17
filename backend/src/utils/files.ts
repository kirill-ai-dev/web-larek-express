import { constants } from 'fs';
import {
  copyFile, lstat, mkdir, readdir, unlink,
} from 'fs/promises';
import path from 'path';
import { IMAGE_URL_PREFIX, TEMP_DIRECTORY, UPLOAD_DIRECTORY } from '../config';
import { BadRequestError } from '../errors';

/** Результат подготовки картинки: нужен для завершения переноса или отката. */
export interface PreparedImage {
  fileName: string;
  copied: boolean;
  temporary: boolean;
}

/** Разрешает только имя картинки в нашей папке, без переходов к другим файлам. */
export const isImageFileName = (fileName: string): boolean => {
  const prefix = `${IMAGE_URL_PREFIX}/`;
  return fileName.startsWith(prefix)
    && /^[a-z\d_-]+\.(png|jpe?g|gif|svg)$/i.test(fileName.slice(prefix.length));
};

/** Проверяет системный код ошибки, не скрывая другие ошибки файловой системы. */
export const isMissingFile = (error: unknown): boolean => typeof error === 'object'
  && error !== null && 'code' in error && error.code === 'ENOENT';

/** Проверяет наличие обычного файла. Символические ссылки не используем. */
const isRegularFile = async (filePath: string): Promise<boolean> => {
  try {
    const info = await lstat(filePath);
    if (!info.isFile()) {
      throw new BadRequestError('Ожидался обычный файл изображения');
    }
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
};

/** Удаляет файл, если он ещё существует. Другие ошибки передаёт вызывающему коду. */
const removeFile = async (filePath: string): Promise<void> => {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
};

/**
 * Копирует загрузку в постоянную папку перед записью товара.
 * Временный оригинал остаётся до успешной записи, чтобы при ошибке не потерять файл.
 * Уже сохранённую картинку можно использовать повторно без перезаписи.
 */
export const prepareImage = async (fileName: string): Promise<PreparedImage> => {
  if (!isImageFileName(fileName)) {
    throw new BadRequestError('Некорректный путь к изображению');
  }
  const name = path.basename(fileName);
  const source = path.join(TEMP_DIRECTORY, name);
  const destination = path.join(UPLOAD_DIRECTORY, name);
  const temporary = await isRegularFile(source);
  if (await isRegularFile(destination)) {
    return { fileName, copied: false, temporary };
  }
  if (!temporary) {
    throw new BadRequestError('Загруженное изображение не найдено');
  }
  await mkdir(UPLOAD_DIRECTORY, { recursive: true });
  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    return { fileName, copied: true, temporary: true };
  } catch (error) {
    // Другой запрос мог сохранить ту же картинку между проверкой и копированием.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      if (await isRegularFile(destination)) return { fileName, copied: false, temporary };
    }
    if (isMissingFile(error)) {
      throw new BadRequestError('Временное изображение больше недоступно');
    }
    throw error;
  }
};

/** Завершает перенос после записи товара: удаляет временный оригинал. */
export const finishImage = async (image: PreparedImage): Promise<void> => {
  if (image.temporary) {
    await removeFile(path.join(TEMP_DIRECTORY, path.basename(image.fileName)));
  }
};

/** Удаляет постоянную картинку. Путь от клиента не может выйти за пределы папки. */
export const removeImage = async (fileName: string): Promise<void> => {
  if (!isImageFileName(fileName)) {
    throw new BadRequestError('Некорректный путь к изображению');
  }
  await removeFile(path.join(UPLOAD_DIRECTORY, path.basename(fileName)));
};

/** Раз в час cron удаляет только временные загрузки, которым больше суток. */
export const cleanupTemporaryFiles = async (): Promise<void> => {
  await mkdir(TEMP_DIRECTORY, { recursive: true });
  const files = await readdir(TEMP_DIRECTORY, { withFileTypes: true });
  const deadline = Date.now() - 24 * 60 * 60 * 1000;
  await Promise.all(files.filter((file) => file.isFile()
    && /^[a-f\d-]{36}\.(png|jpg|gif|svg)$/.test(file.name)).map(async (file) => {
    const filePath = path.join(TEMP_DIRECTORY, file.name);
    try {
      const info = await lstat(filePath);
      if (info.isFile() && info.mtimeMs < deadline) await removeFile(filePath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }));
};
