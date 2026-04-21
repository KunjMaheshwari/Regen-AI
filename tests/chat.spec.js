const { test, expect } = require("@playwright/test");

const CHAT_PATH = "/chat/playwright-chat";
const MODEL_FIXTURE = {
  models: [
    {
      id: "openai/gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: { id: "openai", name: "OpenAI" },
    },
  ],
};

function createStreamBody(chunks) {
  const events = [
    {
      type: "start",
      messageId: "assistant-message",
    },
    {
      type: "text-start",
      id: "assistant-text",
    },
    ...chunks.map(delta => ({
      type: "text-delta",
      id: "assistant-text",
      delta,
    })),
    {
      type: "text-end",
      id: "assistant-text",
    },
    {
      type: "finish",
      finishReason: "stop",
    },
  ];

  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("");
}

async function mockModels(page) {
  await page.route("**/api/ai/get-models", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MODEL_FIXTURE),
    });
  });
}

async function mockChatRoute(page, { status = 200, body, contentType = "text/event-stream; charset=utf-8" }) {
  await page.route("**/api/chat", async route => {
    await route.fulfill({
      status,
      contentType,
      headers: {
        "Cache-Control": "no-cache",
      },
      body,
    });
  });
}

async function installStreamingFetchMock(page, chunks, delayMs = 120) {
  await page.addInitScript(
    ({ streamChunks, streamDelayMs }) => {
      const encoder = new TextEncoder();
      const originalFetch = window.fetch.bind(window);

      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input?.url || "";

        if (url.includes("/api/chat")) {
          let index = 0;

          return new Response(
            new ReadableStream({
              async pull(controller) {
                if (index === 0) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "start",
                        messageId: "assistant-message",
                      })}\n\n`,
                    ),
                  );
                  index += 1;
                  return;
                }

                if (index === 1) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "text-start",
                        id: "assistant-text",
                      })}\n\n`,
                    ),
                  );
                  index += 1;
                  return;
                }

                const chunkIndex = index - 2;

                if (chunkIndex < streamChunks.length) {
                  await new Promise(resolve => setTimeout(resolve, streamDelayMs));
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "text-delta",
                        id: "assistant-text",
                        delta: streamChunks[chunkIndex],
                      })}\n\n`,
                    ),
                  );
                  index += 1;
                  return;
                }

                if (chunkIndex === streamChunks.length) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "text-end",
                        id: "assistant-text",
                      })}\n\n`,
                    ),
                  );
                  index += 1;
                  return;
                }

                if (chunkIndex === streamChunks.length + 1) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "finish",
                        finishReason: "stop",
                      })}\n\n`,
                    ),
                  );
                  controller.close();
                }
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
              },
            },
          );
        }

        return originalFetch(input, init);
      };
    },
    { streamChunks: chunks, streamDelayMs: delayMs },
  );
}

async function openChat(page) {
  await page.goto(CHAT_PATH);
  await page.waitForSelector('[data-testid="chat-input"]');
  await expect(page.getByTestId("message-container")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockModels(page);
});

test("chat flow sends a prompt and renders the AI response", async ({ page }) => {
  await mockChatRoute(page, {
    body: createStreamBody(["Hello from ", "the mocked assistant."]),
  });

  await openChat(page);

  await page.getByTestId("chat-input").fill("Explain the deployment plan.");
  await page.getByTestId("send-button").click();

  await expect(page.getByTestId("message-user")).toContainText("Explain the deployment plan.");
  await expect(page.getByTestId("message-assistant")).toContainText("Hello from the mocked assistant.");
});

test("prompt suggestions populate the chat input", async ({ page }) => {
  await openChat(page);

  const suggestion = page.getByRole("button", {
    name: "Summarize the last discussion into action items.",
  });

  await expect(suggestion).toBeVisible();
  await suggestion.click();

  await expect(page.getByTestId("chat-input")).toHaveValue(
    "Summarize the last discussion into action items.",
  );
});

test("streaming response renders progressively without UI instability", async ({ page }) => {
  await installStreamingFetchMock(page, ["Streaming ", "response ", "complete."]);

  await openChat(page);

  await page.getByTestId("chat-input").fill("Stream the answer.");
  await page.getByTestId("send-button").click();

  const assistantMessage = page.getByTestId("message-assistant");

  await expect(assistantMessage).toContainText("Streaming");
  await expect(assistantMessage).not.toContainText("Streaming response complete.");
  await expect(assistantMessage).toContainText("Streaming response complete.");
  await expect(page.getByTestId("error-message")).toHaveCount(0);
});

test("server failure shows a stable error message", async ({ page }) => {
  await mockChatRoute(page, {
    status: 500,
    contentType: "text/plain; charset=utf-8",
    body: "500 Internal Server Error",
  });

  await openChat(page);

  await page.getByTestId("chat-input").fill("Trigger a server error.");
  await page.getByTestId("send-button").click();

  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(page.getByTestId("error-message")).toContainText(
    "The AI service is temporarily unavailable. Please try again.",
  );
  await expect(page.getByTestId("message-container")).toBeVisible();
});

test("empty assistant response is handled gracefully", async ({ page }) => {
  await mockChatRoute(page, {
    body: createStreamBody([]),
  });

  await openChat(page);

  await page.getByTestId("chat-input").fill("Return nothing.");
  await page.getByTestId("send-button").click();

  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(page.getByTestId("error-message")).toContainText(
    "The assistant returned an empty response.",
  );
  await expect(page.getByTestId("message-container")).toBeVisible();
});

test("rate limiting surfaces retry guidance", async ({ page }) => {
  await mockChatRoute(page, {
    status: 429,
    contentType: "text/plain; charset=utf-8",
    body: "429 Too Many Requests",
  });

  await openChat(page);

  await page.getByTestId("chat-input").fill("Trigger rate limit.");
  await page.getByTestId("send-button").click();

  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(page.getByTestId("error-message")).toContainText(
    "Rate limit reached. Please wait a moment and retry.",
  );
  await expect(page.getByTestId("message-container")).toBeVisible();
});
