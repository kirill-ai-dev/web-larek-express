const pending = new Map<string, Promise<void>>();

/**
 * По очереди выполняет PATCH и DELETE одного товара внутри процесса сервера.
 * Это сохраняет правильную очистку прежней картинки при использовании new: true.
 */
const lockProduct = async (productId: string): Promise<() => void> => {
  const key = productId.toLowerCase();
  const previous = pending.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  pending.set(key, current);
  await previous;
  return () => {
    release();
    if (pending.get(key) === current) pending.delete(key);
  };
};

export default lockProduct;
