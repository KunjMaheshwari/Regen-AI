"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { CHAT_QUERY_GC_TIME, CHAT_QUERY_STALE_TIME } from "@/modules/chat/query-keys";


export function QueryProvider({ children }) {
    const [client] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: CHAT_QUERY_STALE_TIME,
                gcTime: CHAT_QUERY_GC_TIME,
                refetchOnMount: false,
                refetchOnReconnect: false,
                refetchOnWindowFocus: false,
            },
        },
    }))

    return (
        <QueryClientProvider client={client}>
            {children}
        </QueryClientProvider>
    )
}
