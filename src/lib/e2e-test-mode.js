export function isE2ETestMode() {
  return process.env.PLAYWRIGHT_TEST === "true";
}

export function getE2ETestUser() {
  return {
    id: "playwright-user",
    name: "Playwright User",
    email: "playwright@example.com",
    image: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export function getE2ETestChat(chatId) {
  return {
    id: chatId,
    title: "Playwright Chat",
    model: "openai/gpt-4o-mini",
    userId: getE2ETestUser().id,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    message: [],
    messages: [],
  };
}
