export const CHAT_QUERY_STALE_TIME = 5 * 60 * 1000;
export const CHAT_QUERY_GC_TIME = 10 * 60 * 1000;

function normalizePrompt(prompt) {
  return typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
}

export function getChatPromptKey({ prompt, model }) {
  return {
    prompt: normalizePrompt(prompt),
    model: typeof model === "string" && model.trim() ? model.trim() : "default",
  };
}

export const chatQueryKeys = {
  all: () => ["chats"],
  detail: chatId => [...chatQueryKeys.all(), "detail", chatId],
  byPrompt: ({ prompt, model }) => [
    ...chatQueryKeys.all(),
    "response",
    getChatPromptKey({ prompt, model }),
  ],
};
