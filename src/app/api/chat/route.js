import { convertToModelMessages, streamText, tool } from "ai";
import db from "@/lib/db";
import { MessageRole } from "@prisma/client";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompt";

//initializing the open provider router
const provider = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY
})

function convertStoredMessageToUI(msg) {
    try {
        const parts = JSON.parse(msg.content);


        const validParts = parts.filter(part => {

            return part.type === 'text';
        });


        if (validParts.length === 0) {
            return null;
        }

        return {
            id: msg.id,
            role: msg.messageRole.toLowerCase(),
            parts: validParts,
            createdAt: msg.createdAt,
        };
    } catch (e) {

        return {
            id: msg.id,
            role: msg.messageRole.toLowerCase(),
            parts: [{ type: "text", text: msg.content }],
            createdAt: msg.createdAt,
        };
    }
}

function extractPartsAsJSON(message) {
    if (message.parts && Array.isArray(message.parts)) {
        return JSON.stringify(message.parts);
    }

    const content = message.content || "";
    return JSON.stringify([{ type: "text", text: content }]);
}

export async function POST(req) {
    try {
        const { chatId, messages: newMessages, model } = await req.json();

        const previousMessages = chatId ? await db.message.findMany({
            where: {
                orderBy: {
                    createdAt: "asc"
                }
            }
        }) : [];

        const uiMessages = previousMessages
            .map(convertStoredMessageToUI)
            .filter(msg => msg !== null); // Remove invalid messages

        const normalizedNewMessages = Array.isArray(newMessages)
            ? newMessages
            : [newMessages];

        console.log("📊 Previous messages:", uiMessages.length);
        console.log("📊 New messages:", normalizedNewMessages.length);

        const allUIMessages = [...uiMessages, ...normalizedNewMessages];

        let modelMessages;
        try {
            modelMessages = convertToModelMessages(allUIMessages);
            console.log("✅ Converted to model messages:", modelMessages.length);
        } catch (conversionError) {
            console.error("❌ Message conversion error:", conversionError);


            modelMessages = allUIMessages.map(msg => ({
                role: msg.role,
                content: msg.parts
                    .filter(p => p.type === 'text')
                    .map(p => p.text)
                    .join('\n')
            })).filter(m => m.content); // Remove empty messages

            console.log("⚠️ Using fallback conversion:", modelMessages.length);
        }

        console.log("🤖 Final model messages:", JSON.stringify(modelMessages, null, 2));

        const result = streamText({
            model: provider.chat(model),
            messages: modelMessages,
            system: CHAT_SYSTEM_PROMPT,
        });

        return result.toUIMessageStreamResponse({
            sendReasoning: true,
            originalMessages: allUIMessages,
            onFinish: async ({ responseMessage }) => {
                try {
                    const messagesToSave = [];
                    if (!skipUserMessage) {
                        const latestUserMessage = normalizedNewMessages[normalizedNewMessages.length - 1];

                        if (latestUserMessage?.role === "user") {
                            const userPartsJSON = extractPartsAsJSON(latestUserMessage);
                            messagesToSave.push({
                                chatId,
                                content: userPartsJSON,
                                messageRole: MessageRole.USER,
                                model,
                                messageType: "NORMAL",
                            });
                        }
                    }

                    // Save assistant response
                    if (responseMessage?.parts && responseMessage.parts.length > 0) {
                        const assistantPartsJSON = extractPartsAsJSON(responseMessage);


                        messagesToSave.push({
                            chatId,
                            content: assistantPartsJSON,
                            messageRole: MessageRole.ASSISTANT,
                            model,
                            messageType: "NORMAL",
                        });
                    }

                    if (messagesToSave.length > 0) {
                        await db.message.createMany({
                            data: messagesToSave,
                        });

                    }
                } catch (error) {
                    console.error("❌ Error saving messages:", error);
                }
            },
        });
    } catch (error) {
        console.error("❌ API Route Error:", error);
        return new Response(
            JSON.stringify({
                error: error.message || "Internal server error",
                details: error.toString()
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}