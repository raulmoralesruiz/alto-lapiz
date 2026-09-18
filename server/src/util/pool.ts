/**
 * Ejecuta `fn` sobre cada elemento respetando un límite de concurrencia.
 * `onResult` se invoca en el momento en que cada resultado está listo
 * (útil para actualizaciones progresivas).
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, item: T) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) return;
          const item = items[i];
          if (item === undefined) continue;
          results[i] = await fn(item, i);
          onResult?.(results[i], item);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}
