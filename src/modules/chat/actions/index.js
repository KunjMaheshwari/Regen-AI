"use server";

import { revalidatePath } from "next/cache";
import { cacheUserChats, getCachedUserChats, invalidateUserChatCache } from "@/lib/chat-history-cache";
import { getE2ETestChat, isE2ETestMode } from "@/lib/e2e-test-mode";

export const createChatWithMessage = async (values) => {
    try {
        if (isE2ETestMode()) {
            const { content, model } = values;

            return {
                success: true,
                message: "Chat created successfully",
                data: {
                    ...getE2ETestChat("playwright-chat"),
                    title: content?.slice(0, 50) || "Playwright Chat",
                    model: model || "openai/gpt-4o-mini",
                    message: content ? [{
                        id: "playwright-user-message",
                        content,
                        messageRole: "USER",
                        messageType: "NORMAL",
                        model: model || "openai/gpt-4o-mini",
                        createdAt: new Date(0),
                    }] : [],
                }
            };
        }

        const [{ currentUser }, { MessageRole, MessageType }, { default: db }] = await Promise.all([
            import("@/modules/authentication/actions"),
            import("@prisma/client"),
            import("@/lib/db"),
        ]);
        const user = await currentUser();

        if (!user)
            return {
                success: false, message: "Unauthorized user",
            };

        const { content, model } = values;

        if (!content || !content.trim()) {
            return { success: false, message: "Message content is required" };
        }

        const title = content.slice(0, 50) + (content.length > 50 ? "..." : "")

        const chat = await db.chat.create({
            data: {
                title,
                model,
                userId: user.id,
                message: {
                    create: {
                        content,
                        messageRole: MessageRole.USER,
                        messageType: MessageType.NORMAL,
                        model
                    }
                }
            },
            include: {
                message: true
            }
        });

        await invalidateUserChatCache(user.id);
        revalidatePath("/");

        return {
            success: true,
            message: "Chat created successfully",
            data: chat
        };
    } catch (error) {
        console.error("Failed to create chat:", error);
        return {
            success: false,
            message: "Failed to created the chat"
        };
    }
};


export const getAllChats = async () => {
    try {
        if (isE2ETestMode()) {
            return {
                success: true,
                message: "Chats fetched successfully",
                data: []
            };
        }

        const [{ currentUser }, { default: db }] = await Promise.all([
            import("@/modules/authentication/actions"),
            import("@/lib/db"),
        ]);
        const user = await currentUser();

        if (!user) {
            return {
                success: false,
                message: "Unauthorized user"
            }
        }

        const cachedChats = await getCachedUserChats(user.id);
        if (cachedChats) {
            return {
                success: true,
                message: "Chats fetched successfully",
                data: cachedChats
            };
        }

        const chats = await db.chat.findMany({
            where: {
                userId: user.id
            },
            include: {
                message: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        await cacheUserChats(user.id, chats);

        return {
            success: true,
            message: "Chats fetched successfully",
            data: chats
        };
    } catch (error) {
        console.error("Error fetching chats:", error);
        return {
            success: false,
            message: "Failed to fetch chats"
        };
    }
}

export const getChatById = async (chatId) => {
    if (isE2ETestMode()) {
        return {
            success: true,
            message: "Chat Fetched successfully",
            data: getE2ETestChat(chatId),
        };
    }

    const [{ currentUser }, { default: db }] = await Promise.all([
        import("@/modules/authentication/actions"),
        import("@/lib/db"),
    ]);
    const user = await currentUser();

    if (!user) {
        return {
            success: false,
            message: "Unauthorized user"
        }
    }

    try {
        const chat = await db.chat.findUnique({
            where: {
                id: chatId,
            },
            include: {
                message: true
            }
        });

        if (!chat || chat.userId !== user.id) {
            return {
                success: false,
                message: "Chat not found"
            };
        }

        return {
            success: true,
            message: "Chat Fetched successfully",
            data: chat
        };
    } catch (error) {
        console.error("Error fetching chats:", error);
        return {
            success: false,
            message: "Failed to fetch chats"
        };
    }
}


export const deleteChat = async (chatId) => {
    try {
        if (isE2ETestMode()) {
            return {
                success: true,
                message: "Chat deleted successfully"
            };
        }

        const [{ currentUser }, { default: db }] = await Promise.all([
            import("@/modules/authentication/actions"),
            import("@/lib/db"),
        ]);
        const user = await currentUser();

        if (!user) {
            return {
                success: false,
                message: "Unauthorized user"
            };
        }

        const chat = await db.chat.findUnique({
            where: {
                id: chatId,
                userId: user.id
            }
        });

        if (!chat) {
            return {
                success: false,
                message: "Chat not found"
            };
        }

        await db.chat.delete({
            where: {
                id: chatId
            }
        });
        await invalidateUserChatCache(user.id);
        revalidatePath(`/chat/${chatId}`);
        return {
            success: true,
            message: "Chat deleted successfully"
        };
    } catch (error) {
        console.error("Error deleting chat:", error);
        return {
            success: false,
            message: "Failed to delete chat"
        };
    }
}
