import { convertToModelMessages, streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { MessageRole, MessageType } from "@prisma/client";

import db from "@/lib/db";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompt";

const provider = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 700;
const FALLBACK_MESSAGE =
  "The AI service is temporarily unavailable. Please try again in a moment.";

function jsonResponse(payload, status = 200) {
  return Response.json(payload, { status });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getStatusCode(error) {
  if (typeof error?.statusCode === "number") {
    return error.statusCode;
  }

  if (typeof error?.status === "number") {
    return error.status;
  }

  if (typeof error?.response?.status === "number") {
    return error.response.status;
  }

  if (typeof error?.cause?.status === "number") {
    return error.cause.status;
  }

  return 500;
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function isRetryableError(error) {
  const status = getStatusCode(error);
  return status === 429 || status >= 500;
}

function createFallbackStreamResponse(message, originalMessages, status = 200) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "start",
            messageId: crypto.randomUUID(),
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "text-start",
            id: "fallback-text",
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "text-delta",
            id: "fallback-text",
            delta: message,
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "text-end",
            id: "fallback-text",
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "finish",
            finishReason: "stop",
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  console.warn("[/api/chat] Returning fallback stream response", {
    status,
    originalMessages: originalMessages.length,
  });

  return new Response(stream, {
    status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function normalizeTextPart(part) {
  if (!part || typeof part !== "object") {
    return null;
  }

  if (part.type !== "text" || typeof part.text !== "string") {
    return null;
  }

  const text = part.text.trim();
  if (!text) {
    return null;
  }

  return {
    type: "text",
    text,
  };
}

function normalizeUIMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const role = message.role;
  if (!["system", "user", "assistant"].includes(role)) {
    return null;
  }

  const partsFromPayload = Array.isArray(message.parts)
    ? message.parts.map(normalizeTextPart).filter(Boolean)
    : [];

  const fallbackText =
    typeof message.content === "string" ? message.content.trim() : "";

  const parts =
    partsFromPayload.length > 0
      ? partsFromPayload
      : fallbackText
        ? [{ type: "text", text: fallbackText }]
        : [];

  if (parts.length === 0) {
    return null;
  }

  return {
    id:
      typeof message.id === "string" && message.id.length > 0
        ? message.id
        : crypto.randomUUID(),
    role,
    parts,
  };
}

function parseStoredMessage(message) {
  try {
    return normalizeUIMessage({
      id: message.id,
      role: message.messageRole.toLowerCase(),
      parts: JSON.parse(message.content),
    });
  } catch (error) {
    console.warn("[/api/chat] Failed to parse stored message; using fallback text", {
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    });

    return normalizeUIMessage({
      id: message.id,
      role: message.messageRole.toLowerCase(),
      content: message.content,
    });
  }
}

function serializeMessageParts(message) {
  const textParts = Array.isArray(message?.parts)
    ? message.parts.map(normalizeTextPart).filter(Boolean)
    : [];

  return JSON.stringify(textParts);
}

function getMessagePreview(message) {
  if (!message?.parts) {
    return "";
  }

  return message.parts
    .map(normalizeTextPart)
    .filter(Boolean)
    .map(part => part.text)
    .join(" ")
    .slice(0, 120);
}

async function getRequestBody(request) {
  try {
    return await request.json();
  } catch (error) {
    console.error("[/api/chat] Invalid JSON body", error);
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await getRequestBody(request);
    if (!body) {
      return jsonResponse({ error: "Invalid JSON request body." }, 400);
    }

    const {
      chatId,
      messages: incomingMessages,
      model: requestedModel,
      skipUserMessage = false,
    } = body;

    const model =
      typeof requestedModel === "string" && requestedModel.trim()
        ? requestedModel.trim()
        : DEFAULT_MODEL;

    console.log("[/api/chat] Incoming request", {
      chatId,
      model,
      skipUserMessage,
      incomingMessages: Array.isArray(incomingMessages) ? incomingMessages.length : 0,
    });

    if (!process.env.OPENROUTER_API_KEY) {
      console.error("[/api/chat] Missing OPENROUTER_API_KEY");
      return jsonResponse(
        { error: "Missing OPENROUTER_API_KEY on the server." },
        500,
      );
    }

    let uiMessages = Array.isArray(incomingMessages)
      ? incomingMessages.map(normalizeUIMessage).filter(Boolean)
      : [];

    if (uiMessages.length === 0 && chatId) {
      const storedMessages = await db.message.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
      });

      uiMessages = storedMessages.map(parseStoredMessage).filter(Boolean);

      console.log("[/api/chat] Loaded fallback messages from DB", {
        chatId,
        count: uiMessages.length,
      });
    }

    if (uiMessages.length === 0) {
      console.error("[/api/chat] No valid messages to process");
      return jsonResponse(
        { error: "No valid messages were provided." },
        400,
      );
    }

    const modelMessages = await convertToModelMessages(
      uiMessages.map(({ id, ...message }) => message),
    );

    console.log("[/api/chat] Prepared model messages", {
      totalMessages: modelMessages.length,
      lastRole: uiMessages.at(-1)?.role,
      lastPreview: getMessagePreview(uiMessages.at(-1)),
      model,
    });

    let result;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        console.log("[/api/chat] Starting provider stream attempt", {
          attempt: attempt + 1,
          maxAttempts: MAX_RETRIES + 1,
          model,
        });

        result = streamText({
          model: provider.chat(model),
          system: CHAT_SYSTEM_PROMPT,
          messages: modelMessages,
          onChunk: async ({ chunk }) => {
            if (chunk.type === "text-delta" && chunk.text) {
              console.log("[/api/chat] Streaming chunk", {
                length: chunk.text.length,
                attempt: attempt + 1,
              });
            }
          },
          onError: async ({ error }) => {
            console.error("[/api/chat] Provider stream error", {
              attempt: attempt + 1,
              status: getStatusCode(error),
              message: getErrorMessage(error),
            });
          },
          onFinish: async ({ text, finishReason }) => {
            console.log("[/api/chat] Provider stream finished", {
              attempt: attempt + 1,
              finishReason,
              textLength: text?.length ?? 0,
            });
          },
        });

        break;
      } catch (error) {
        lastError = error;
        const status = getStatusCode(error);
        const retryable = isRetryableError(error);

        console.error("[/api/chat] Failed to start provider stream", {
          attempt: attempt + 1,
          status,
          retryable,
          message: getErrorMessage(error),
        });

        if (!retryable || attempt === MAX_RETRIES) {
          break;
        }

        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }

    if (!result) {
      const status = getStatusCode(lastError);
      const message =
        status === 429
          ? "The AI provider is rate-limited right now. Please retry shortly."
          : FALLBACK_MESSAGE;

      if (status === 429 || status >= 500) {
        return createFallbackStreamResponse(message, uiMessages, 200);
      }

      return jsonResponse(
        {
          error: getErrorMessage(lastError),
        },
        status || 500,
      );
    }

    return result.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      sendReasoning: true,
      onFinish: async ({ responseMessage, isAborted, finishReason }) => {
        console.log("[/api/chat] UI stream finished", {
          chatId,
          isAborted,
          finishReason,
          preview: getMessagePreview(responseMessage),
        });

        if (!chatId || isAborted) {
          return;
        }

        try {
          const messagesToSave = [];
          const latestUserMessage = [...uiMessages]
            .reverse()
            .find(message => message.role === "user");

          if (!skipUserMessage && latestUserMessage) {
            messagesToSave.push({
              chatId,
              content: serializeMessageParts(latestUserMessage),
              messageRole: MessageRole.USER,
              model,
              messageType: MessageType.NORMAL,
            });
          }

          const assistantContent = serializeMessageParts(responseMessage);
          const parsedAssistantParts = JSON.parse(assistantContent);

          if (parsedAssistantParts.length === 0) {
            console.warn("[/api/chat] Empty assistant response; skipping persistence");
            return;
          }

          messagesToSave.push({
            chatId,
            content: assistantContent,
            messageRole: MessageRole.ASSISTANT,
            model,
            messageType: MessageType.NORMAL,
          });

          await db.message.createMany({
            data: messagesToSave,
          });

          console.log("[/api/chat] Persisted messages", {
            chatId,
            count: messagesToSave.length,
          });
        } catch (error) {
          console.error("[/api/chat] Failed to persist messages", error);
        }
      },
      onError: error => {
        const status = getStatusCode(error);
        const message =
          status === 429
            ? "The AI provider is rate-limited right now. Please retry shortly."
            : FALLBACK_MESSAGE;

        console.error("[/api/chat] UI stream response error", {
          status,
          message: getErrorMessage(error),
        });

        return message;
      },
    });
  } catch (error) {
    console.error("[/api/chat] Route failure", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
}
