/**
 * The handful of key-value primitives the game and recording services need.
 * Redis provides them in production; `memoryKv` backs tests and scripts that
 * run without a server.
 */
import type { Redis } from "ioredis";

export interface Kv {
  get(key: string): Promise<string | null>;
  /** Cheap presence check (no value transfer). */
  exists(key: string): Promise<boolean>;
  set(key: string, value: string): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Append to a list; resolves with the list's new length. */
  rpush(key: string, value: string): Promise<number>;
  /** Whole list, in insertion order. */
  lrange(key: string): Promise<string[]>;
  /** Keep only the first `count` elements. */
  ltrim(key: string, count: number): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  persist(key: string): Promise<void>;
}

export function redisKv(getRedis: () => Redis): Kv {
  return {
    get: (key) => getRedis().get(key),
    exists: async (key) => (await getRedis().exists(key)) > 0,
    set: async (key, value) => {
      await getRedis().set(key, value);
    },
    del: async (...keys) => {
      if (keys.length > 0) await getRedis().del(...keys);
    },
    rpush: (key, value) => getRedis().rpush(key, value),
    lrange: (key) => getRedis().lrange(key, 0, -1),
    ltrim: async (key, count) => {
      if (count <= 0) await getRedis().del(key);
      else await getRedis().ltrim(key, 0, count - 1);
    },
    expire: async (key, seconds) => {
      await getRedis().expire(key, seconds);
    },
    persist: async (key) => {
      await getRedis().persist(key);
    },
  };
}

export function memoryKv(): Kv {
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();
  return {
    get: async (key) => strings.get(key) ?? null,
    exists: async (key) => strings.has(key) || lists.has(key),
    set: async (key, value) => {
      strings.set(key, value);
    },
    del: async (...keys) => {
      for (const key of keys) {
        strings.delete(key);
        lists.delete(key);
      }
    },
    rpush: async (key, value) => {
      const list = lists.get(key) ?? [];
      list.push(value);
      lists.set(key, list);
      return list.length;
    },
    lrange: async (key) => [...(lists.get(key) ?? [])],
    ltrim: async (key, count) => {
      const list = lists.get(key);
      if (!list) return;
      if (count <= 0) lists.delete(key);
      else lists.set(key, list.slice(0, count));
    },
    expire: async () => {},
    persist: async () => {},
  };
}
