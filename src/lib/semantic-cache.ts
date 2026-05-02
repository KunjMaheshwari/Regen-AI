import "server-only";

import { createHash } from "node:crypto";

import { connectToRedis } from "@/lib/redis";

const EMBEDDING_DIMENSIONS = 256;
const SEMANTIC_CACHE_PREFIX = "semantic-cache";
const SEMANTIC_CACHE_LIMIT = 100;
const DEFAULT_SIMILARITY_THRESHOLD = 0.92;
const DEFAULT_SEMANTIC_CACHE_TTL_SECONDS = 60 * 60;

type SemanticCacheEntry<T> = {
  id: string;
  prompt: string;
  embedding: number[];
  payload: T;
  createdAt: number;
  expiresAt: number;
};

function getSimilarityThreshold() {
  const parsed = Number(process.env.SEMANTIC_CACHE_THRESHOLD);

  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1) {
    return parsed;
  }

  return DEFAULT_SIMILARITY_THRESHOLD;
}

function tokenize(input: string) {
  const tokens = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .split(/\s+/)
    .filter(token => token.length > 1);

  if (tokens.length > 0) {
    return tokens;
  }

  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split("");
}

function hashToken(token: string) {
  const hash = createHash("sha256").update(token).digest();
  const index = hash.readUInt16BE(0) % EMBEDDING_DIMENSIONS;
  const sign = hash[2] % 2 === 0 ? 1 : -1;

  return { index, sign };
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map(value => Number((value / magnitude).toFixed(6)));
}

export function createPromptEmbedding(prompt: string) {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = tokenize(prompt);

  tokens.forEach(token => {
    const { index, sign } = hashToken(token);
    vector[index] += sign;
  });

  return normalizeVector(vector);
}

export function cosineSimilarity(first: number[], second: number[]) {
  if (first.length !== second.length) {
    return 0;
  }

  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

export function createSemanticCacheKey(scope: string) {
  const scopeHash = createHash("sha256").update(scope).digest("hex");

  return `${SEMANTIC_CACHE_PREFIX}:${scopeHash}`;
}

export async function getSemanticCache<T>({
  key,
  prompt,
  threshold = getSimilarityThreshold(),
}: {
  key: string;
  prompt: string;
  threshold?: number;
}) {
  const redis = await connectToRedis();
  const embedding = createPromptEmbedding(prompt);
  const entries = await redis.lrange(key, 0, SEMANTIC_CACHE_LIMIT - 1);
  const now = Date.now();
  let bestMatch: { entry: SemanticCacheEntry<T>; similarity: number } | null = null;

  for (const serializedEntry of entries) {
    try {
      const entry = JSON.parse(serializedEntry) as SemanticCacheEntry<T>;

      if (entry.expiresAt <= now || !Array.isArray(entry.embedding)) {
        continue;
      }

      const similarity = cosineSimilarity(embedding, entry.embedding);

      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { entry, similarity };
      }
    } catch (error) {
      console.warn("[semantic-cache] Failed to parse semantic cache entry", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    payload: bestMatch.entry.payload,
    prompt: bestMatch.entry.prompt,
    similarity: bestMatch.similarity,
  };
}

export async function setSemanticCache<T>({
  key,
  prompt,
  payload,
  ttl = DEFAULT_SEMANTIC_CACHE_TTL_SECONDS,
}: {
  key: string;
  prompt: string;
  payload: T;
  ttl?: number;
}) {
  const redis = await connectToRedis();
  const now = Date.now();
  const entry: SemanticCacheEntry<T> = {
    id: createHash("sha256").update(`${key}:${prompt}`).digest("hex"),
    prompt,
    embedding: createPromptEmbedding(prompt),
    payload,
    createdAt: now,
    expiresAt: now + ttl * 1000,
  };

  await redis.lpush(key, JSON.stringify(entry));
  await redis.ltrim(key, 0, SEMANTIC_CACHE_LIMIT - 1);
  await redis.expire(key, ttl);
}
