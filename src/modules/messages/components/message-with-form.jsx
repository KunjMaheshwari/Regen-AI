"use client";

import { useChat } from "@ai-sdk/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcwIcon, StopCircleIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { ModelSelector } from "@/components/ai-elements/model-selector";
import { PromptInput, PromptInputBody, PromptInputButton, PromptInputSubmit, PromptInputTextarea, PromptInputToolbar, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Spinner } from "@/components/ui/spinner";
import { useAIModels } from "@/modules/ai-agent/hook/ai-agent";
import { useGetChatById } from "@/modules/chat/hooks/chat";
import { useChatStore } from "@/modules/chat/store/chat-store";

const promptSuggestions = [
  "Summarize the last discussion into action items.",
  "Turn this idea into a product requirements draft.",
  "Review this plan and point out the biggest risks.",
  "Write a concise follow-up message I can send.",
];

function normalizeStoredMessage(message) {
  if (!message?.id || !message?.messageRole) {
    return null;
  }

  try {
    const parsedParts = JSON.parse(message.content);
    const parts = Array.isArray(parsedParts)
      ? parsedParts.filter(
        part => part?.type === "text" || part?.type === "reasoning" || part?.type === "step-start",
      )
      : [];

    if (parts.length === 0) {
      return null;
    }

    return {
      id: message.id,
      role: message.messageRole.toLowerCase(),
      parts,
      createdAt: message.createdAt,
    };
  } catch {
    const fallbackText = typeof message.content === "string" ? message.content.trim() : "";

    if (!fallbackText) {
      return null;
    }

    return {
      id: message.id,
      role: message.messageRole.toLowerCase(),
      parts: [{ type: "text", text: fallbackText }],
      createdAt: message.createdAt,
    };
  }
}

function getRenderableParts(message) {
  if (Array.isArray(message?.parts) && message.parts.length > 0) {
    return message.parts;
  }

  if (typeof message?.content === "string" && message.content.trim()) {
    return [{ type: "text", text: message.content }];
  }

  return [];
}

function hasVisibleText(message) {
  return getRenderableParts(message).some(
    part => (part.type === "text" || part.type === "reasoning") && typeof part.text === "string" && part.text.trim(),
  );
}

export default function MessageViewWithForm({ chatId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isPending } = useGetChatById(chatId);
  const { data: models, isPending: isModelLoading } = useAIModels();
  const { hasChatBeenTriggered, markChatAsTriggered } = useChatStore();

  const [selectedModel, setSelectedModel] = useState(null);
  const [clientError, setClientError] = useState("");
  const [input, setInput] = useState("");
  const hasAutoTriggered = useRef(false);
  const hydrationKeyRef = useRef("");

  const shouldAutoTrigger = searchParams.get("autoTrigger") === "true";

  const initialMessages = useMemo(() => {
    const storedMessages = Array.isArray(data?.data?.message)
      ? data.data.message
      : Array.isArray(data?.data?.messages)
        ? data.data.messages
        : [];

    return storedMessages
      .map(normalizeStoredMessage)
      .filter(Boolean);
  }, [data]);

  const initialMessageKey = useMemo(
    () =>
      JSON.stringify(
        initialMessages.map(message => ({
          id: message.id,
          role: message.role,
          parts: message.parts,
        })),
      ),
    [initialMessages],
  );

  const activeModel = selectedModel ?? data?.data?.model ?? null;

  const { messages, setMessages, status, error, sendMessage, regenerate, stop } = useChat({
    id: chatId,
    api: "/api/chat",
    messages: [],
    onError: chatError => {
      console.error("[chat-ui] useChat error", chatError);
      setClientError(chatError.message || "The request failed.");
    },
    onFinish: ({ message, isError, finishReason }) => {
      console.log("[chat-ui] stream finished", {
        finishReason,
        isError,
        parts: message?.parts?.length ?? 0,
      });

      if (!hasVisibleText(message)) {
        setClientError("The assistant returned an empty response.");
      } else {
        setClientError("");
      }
    },
  });

  useEffect(() => {
    console.log("[chat-ui] state", {
      chatId,
      status,
      messageCount: messages.length,
    });
  }, [chatId, messages.length, status]);

  useEffect(() => {
    if (isPending) {
      return;
    }

    const nextHydrationKey = `${chatId}:${initialMessageKey}`;
    if (hydrationKeyRef.current === nextHydrationKey) {
      return;
    }

    console.log("[chat-ui] hydrating messages from server", {
      chatId,
      count: initialMessages.length,
    });

    setMessages(initialMessages);
    hydrationKeyRef.current = nextHydrationKey;
  }, [chatId, initialMessageKey, initialMessages, isPending, setMessages]);

  useEffect(() => {
    if (isPending) {
      return;
    }

    if (hasAutoTriggered.current) {
      return;
    }

    if (!shouldAutoTrigger || !activeModel || hasChatBeenTriggered(chatId)) {
      return;
    }

    if (initialMessages.length > 0 && messages.length < initialMessages.length) {
      return;
    }

    const lastMessage = initialMessages.at(-1);
    if (!lastMessage || lastMessage.role !== "user") {
      return;
    }

    hasAutoTriggered.current = true;
    markChatAsTriggered(chatId);

    console.log("[chat-ui] auto trigger assistant response", {
      chatId,
      model: activeModel,
    });

    sendMessage(undefined, {
      body: {
        chatId,
        model: activeModel,
        skipUserMessage: true,
      },
    }).catch(chatError => {
      console.error("[chat-ui] auto trigger failed", chatError);
      setClientError(chatError.message || "Failed to auto-start the assistant.");
    });

    router.replace(`/chat/${chatId}`, { scroll: false });
  }, [
    activeModel,
    chatId,
    hasChatBeenTriggered,
    initialMessages,
    isPending,
    markChatAsTriggered,
    messages.length,
    router,
    sendMessage,
    shouldAutoTrigger,
  ]);

  const handleSubmit = async ({ text }) => {
    const trimmedInput = text.trim();

    if (!trimmedInput || status === "streaming" || !activeModel) {
      return;
    }

    setClientError("");

    console.log("[chat-ui] sending message", {
      chatId,
      model: activeModel,
      preview: trimmedInput.slice(0, 120),
    });

    try {
      await sendMessage(
        { text: trimmedInput },
        {
          body: {
            chatId,
            model: activeModel,
            skipUserMessage: false,
          },
        },
      );

      setInput("");
    } catch (chatError) {
      console.error("[chat-ui] send failed", chatError);
      setClientError(chatError.message || "Failed to send message.");
    }
  };

  const handleRetry = async () => {
    if (!activeModel || status === "streaming") {
      return;
    }

    setClientError("");
    console.log("[chat-ui] regenerating last assistant response", {
      chatId,
      model: activeModel,
    });

    try {
      await regenerate({
        body: {
          chatId,
          model: activeModel,
          skipUserMessage: true,
        },
      });
    } catch (chatError) {
      console.error("[chat-ui] regenerate failed", chatError);
      setClientError(chatError.message || "Failed to regenerate response.");
    }
  };

  const handleStop = async () => {
    console.log("[chat-ui] stopping active stream", { chatId });
    await stop();
  };

  const handleSuggestionClick = async (suggestion) => {
    console.log("[chat-ui] suggestion selected", {
      chatId,
      suggestion,
    });

    setInput(suggestion);
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-[calc(100vh-4rem)] max-w-4xl p-6 size-full">
      <div className="flex h-full flex-col">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-500">
                Start a conversation...
              </div>
            ) : (
              messages.map((message, messageIndex) => {
                const parts = getRenderableParts(message);

                return (
                  <Fragment key={message.id ?? `message-${messageIndex}`}>
                    {parts.map((part, partIndex) => {
                      if (part.type === "text") {
                        return (
                          <Message
                            from={message.role}
                            key={`${message.id ?? messageIndex}-${partIndex}`}
                          >
                            <MessageContent>
                              <Response>{part.text}</Response>
                            </MessageContent>
                          </Message>
                        );
                      }

                      if (part.type === "reasoning") {
                        return (
                          <Reasoning
                            className="max-w-2xl rounded-md border border-muted bg-muted/50 px-4 py-4"
                            key={`${message.id ?? messageIndex}-${partIndex}`}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent className="mt-2 font-light italic text-muted-foreground">
                              {part.text}
                            </ReasoningContent>
                          </Reasoning>
                        );
                      }

                      if (part.type === "step-start") {
                        return partIndex > 0 ? (
                          <div
                            className="my-4 text-gray-500"
                            key={`${message.id ?? messageIndex}-${partIndex}`}
                          >
                            <hr className="border-gray-300" />
                          </div>
                        ) : null;
                      }

                      return null;
                    })}
                  </Fragment>
                );
              })
            )}

            {(status === "submitted" || status === "streaming") && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner />
                <span className="text-sm">Regen AI is thinking...</span>
              </div>
            )}

            {(clientError || error) && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {clientError || error?.message || "Something went wrong."}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput className="mt-4" onSubmit={handleSubmit}>
          {messages.length === 0 && (
            <Suggestions className="px-3 py-3">
              {promptSuggestions.map(suggestion => (
                <Suggestion
                  key={suggestion}
                  onClick={handleSuggestionClick}
                  suggestion={suggestion}
                />
              ))}
            </Suggestions>
          )}
          <PromptInputBody>
            <PromptInputTextarea
              disabled={status === "streaming"}
              name="message"
              placeholder="Type your message..."
              onChange={event => setInput(event.target.value)}
              value={input}
            />
          </PromptInputBody>
          <PromptInputToolbar>
            <PromptInputTools className="flex items-center gap-2">
              {isModelLoading ? (
                <Spinner />
              ) : (
                <ModelSelector
                  models={models?.models}
                  onModelSelect={setSelectedModel}
                  selectedModelId={activeModel}
                />
              )}

              {status === "streaming" ? (
                <PromptInputButton onClick={handleStop}>
                  <StopCircleIcon size={16} />
                  <span>Stop</span>
                </PromptInputButton>
              ) : (
                messages.length > 0 && (
                  <PromptInputButton onClick={handleRetry}>
                    <RotateCcwIcon size={16} />
                    <span>Retry</span>
                  </PromptInputButton>
                )
              )}
            </PromptInputTools>
            <PromptInputSubmit disabled={!activeModel} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
}
