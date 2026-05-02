import "server-only";

import { createHash } from "node:crypto";

import { connectToRedis } from "@/lib/redis";

const DEFAULT_CACHE_TTL_SECONDS = 60 * 60;
const CACHE_KEY_PREFIX = "cache";

export function generateHashKey(input: string) {
  return `${CACHE_KEY_PREFIX}:${createHash("sha256").update(input).digest("hex")}`;
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const redis = await connectToRedis();
  const value = await redis.get(key);

  if (value === null) {
    return null;
  }

  return JSON.parse(value) as T;
}

export async function setCache<T>(
  key: string,
  value: T,
  ttl = DEFAULT_CACHE_TTL_SECONDS,
) {
  const redis = await connectToRedis();

  await redis.set(key, JSON.stringify(value), "EX", ttl);
}

export async function deleteCache(key: string) {
  const redis = await connectToRedis();

  await redis.del(key);
}
