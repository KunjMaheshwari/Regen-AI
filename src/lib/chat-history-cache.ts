import "server-only";

import { deleteCache, getCache, setCache } from "@/lib/cache";

export function getUserChatCacheKey(userId: string) {
  return `chat:${userId}`;
}

export async function getCachedUserChats<T = unknown>(userId: string) {
  try {
    return await getCache<T>(getUserChatCacheKey(userId));
  } catch (error) {
    console.warn("[chat-history-cache] Failed to read chat history cache", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function cacheUserChats<T>(userId: string, chats: T) {
  try {
    await setCache(getUserChatCacheKey(userId), chats);
  } catch (error) {
    console.warn("[chat-history-cache] Failed to write chat history cache", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function invalidateUserChatCache(userId?: string | null) {
  if (!userId) {
    return;
  }

  try {
    await deleteCache(getUserChatCacheKey(userId));
  } catch (error) {
    console.warn("[chat-history-cache] Failed to invalidate chat history cache", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
