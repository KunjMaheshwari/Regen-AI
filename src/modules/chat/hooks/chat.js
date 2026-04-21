"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createChatWithMessage, deleteChat, getChatById } from "../actions";


export const useCreateChat = () => {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: (values) => createChatWithMessage(values),
        onSuccess: (res) => {
            if (res.success && res.data) {
                const chat = res.data;
                queryClient.invalidateQueries({ queryKey: ["chats"] });
                router.push(`/chat/${chat.id}?autoTrigger=true`);
                return;
            }

            toast.error(res.message || "Failed to create chat!");
        },
        onError: (error) => {
            console.error("Create chat error: ", error);
            toast.error("Failed to create chat!");
        }
    });
};

export const useGetChatById = (chatId)=>{
  return useQuery({
    queryKey:["chats", chatId],
    queryFn:()=>getChatById(chatId),
    enabled: Boolean(chatId),
  })
}


export const useDeleteChat = (chatId) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => deleteChat(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries(["chats"]);
      router.push("/");
    },
    onError: () => {
      toast.error("Failed to delete chat");
    },
  });
};