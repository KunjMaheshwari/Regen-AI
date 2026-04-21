import { convertToModelMessages, streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { MessageRole, MessageType } from "@prisma/client";

import db from "@/lib/db";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompt";

const provider = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

function jsonResponse(payload, status = 200) {
  return Response.json(payload, { status });
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
      model,
      skipUserMessage = false,
    } = body;

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

    if (!model || typeof model !== "string") {
      console.error("[/api/chat] Missing model");
      return jsonResponse({ error: "Model is required." }, 400);
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
    });

    const result = streamText({
      model: provider.chat(model),
      system: CHAT_SYSTEM_PROMPT,
      messages: modelMessages,
      onChunk: async ({ chunk }) => {
        if (chunk.type === "text-delta" && chunk.text) {
          console.log("[/api/chat] Streaming chunk", {
            length: chunk.text.length,
          });
        }
      },
      onError: async ({ error }) => {
        console.error("[/api/chat] Provider stream error", error);
      },
      onFinish: async ({ text, finishReason }) => {
        console.log("[/api/chat] Provider stream finished", {
          finishReason,
          textLength: text?.length ?? 0,
        });
      },
    });

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
        console.error("[/api/chat] UI stream response error", error);
        return "The assistant response failed.";
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
