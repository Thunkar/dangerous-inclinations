/**
 * In-process serialization by key. Every mutation of a game (or a lobby) runs
 * inside `lock(id, fn)`, so two requests for the same id never interleave
 * across their awaits.
 *
 * This is a single-process lock: it serializes this server instance only. A
 * multi-instance deployment would need Redis locks instead.
 */
export type KeyedLock = <T>(key: string, fn: () => Promise<T>) => Promise<T>;

export function createKeyedLock(): KeyedLock {
  const chains = new Map<string, Promise<void>>();

  return function lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const settled: Promise<void> = run.then(
      () => undefined,
      () => undefined,
    );
    chains.set(key, settled);
    void settled.then(() => {
      if (chains.get(key) === settled) chains.delete(key);
    });
    return run;
  };
}
