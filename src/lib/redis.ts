import "server-only";

import Redis from "ioredis";

import { requiredEnv } from "@/lib/env";

type RedisGlobal = typeof globalThis & {
  redis?: Redis;
};

const globalForRedis = globalThis as RedisGlobal;

function getRedisUrl() {
  return requiredEnv("REDIS_URL");
}

function createRedisClient() {
  const client = new Redis(getRedisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    retryStrategy(times) {
      return Math.min(times * 200, 2_000);
    },
  });

  client.on("error", error => {
    console.error("[redis] Connection error", error);
  });

  return client;
}

export function getRedisClient() {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedisClient();
  }

  return globalForRedis.redis;
}

export async function connectToRedis() {
  let redis = getRedisClient();

  if (redis.status === "end") {
    globalForRedis.redis = createRedisClient();
    redis = globalForRedis.redis;
  }

  if (redis.status === "wait") {
    await redis.connect();
  }

  return redis;
}
