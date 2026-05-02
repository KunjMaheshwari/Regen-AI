"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createChatWithMessage, deleteChat, getChatById } from "../actions";
import { CHAT_QUERY_GC_TIME, CHAT_QUERY_STALE_TIME, chatQueryKeys } from "../query-keys";


export const useCreateChat = () => {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: (values) => createChatWithMessage(values),
        onSuccess: (res, values) => {
            if (res.success && res.data) {
                const chat = res.data;
                const prompt = values?.content;
                const model = values?.model ?? chat.model;

                queryClient.setQueryData(chatQueryKeys.detail(chat.id), res);
                queryClient.setQueryData(
                    chatQueryKeys.byPrompt({ prompt, model }),
                    res,
                );
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
    queryKey: chatQueryKeys.detail(chatId),
    queryFn:()=>getChatById(chatId),
    enabled: Boolean(chatId),
    staleTime: CHAT_QUERY_STALE_TIME,
    gcTime: CHAT_QUERY_GC_TIME,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
}

export const useGetChatByPrompt = ({ prompt, model, chatId }) => {
  return useQuery({
    queryKey: chatQueryKeys.byPrompt({ prompt, model }),
    queryFn: () => getChatById(chatId),
    enabled: Boolean(chatId && prompt),
    staleTime: CHAT_QUERY_STALE_TIME,
    gcTime: CHAT_QUERY_GC_TIME,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
};


export const useDeleteChat = (chatId) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => deleteChat(chatId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: chatQueryKeys.detail(chatId) });
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.all(),
        refetchType: "inactive",
      });
      router.push("/");
    },
    onError: () => {
      toast.error("Failed to delete chat");
    },
  });
};
