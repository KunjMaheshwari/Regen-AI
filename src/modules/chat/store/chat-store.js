import { create } from "zustand";

export const useChatStore = create((set, get) => ({
    chats: [],
    activeChatId: null,
    messages: [],
    triggeredChats: new Set(),
    setChats: (chats) => set({ chats }),
    setActiveChatId: (chatId) => set({ activeChatId: chatId }),
    setMessages: (messages) => set({ messages }),

    addChat: (chat) => set({ chats: [chat, ...get().chats] }),

    addMessage: (message) => set({ messages: [...get().messages, message] }),

    clearMessages: () => set({ messages: [] }),

    markChatAsTriggered: (chatId) => {
        const triggered = new Set(get().triggeredChats);
        triggered.add(chatId);
        set({ triggeredChats: triggered });
    },

    hasChatBeenTriggered: (chatId) => {
        return get().triggeredChats.has(chatId);
    },
}))