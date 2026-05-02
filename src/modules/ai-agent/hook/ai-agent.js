import { useQuery } from "@tanstack/react-query";

import { CHAT_QUERY_GC_TIME, CHAT_QUERY_STALE_TIME } from "@/modules/chat/query-keys";

export const useAIModels = () => {
    return useQuery({
        queryKey: ["ai-models"],
        queryFn: () => fetch("/api/ai/get-models").then(res => res.json()),
        staleTime: CHAT_QUERY_STALE_TIME,
        gcTime: CHAT_QUERY_GC_TIME,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
    })
}
