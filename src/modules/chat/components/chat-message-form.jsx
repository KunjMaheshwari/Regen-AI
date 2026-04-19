"use client"

import React from 'react'
import { useState, useEffect } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { useAIModels } from '@/modules/ai-agent/hook/ai-agent'
import { ModelSelector } from './model-selector'
import { useCreateChat } from '../hooks/chat'
import { toast } from 'sonner'

const ChatMessageForm = ({ initialMessage, onMessageChange }) => {

    const { data: models, isPending } = useAIModels();
    const [selectedModel, setSelectedModel] = useState();
    const [message, setMessage] = useState("");
    const { mutateAsync, isPending: isChatPending } = useCreateChat();
    const activeModelId = selectedModel ?? models?.models?.[0]?.id;

    useEffect(() => {
        if (initialMessage) {
            const frameId = requestAnimationFrame(() => {
                setMessage(initialMessage)
            })
            onMessageChange?.("")
            return () => cancelAnimationFrame(frameId)
        }
    }, [initialMessage, onMessageChange])

    const handleSubmit = async (e) => {
        try {
            e.preventDefault();
            await mutateAsync({ content: message, model: activeModelId });
            toast.success("Message sent successfully");
        } catch (error) {
            console.log(error);
            toast.error("Failed to send message");
        } finally {
            setMessage("");
        }
    }


    return (
        <div className="w-full max-w-3xl mx-auto px-4 pb-6">
            <form onSubmit={handleSubmit} className="relative">
                {/* Main Input Container */}
                <div className="relative rounded-2xl border border-border shadow-sm   transition-all">
                    {/* Textarea */}
                    <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your message here..."
                        className="min-h-15 max-h-50 resize-none border-0 bg-transparent px-4 py-3 text-base focus-visible:ring-0 focus-visible:ring-offset-0 "
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !isChatPending) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />

                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t ">
                        {/* Left side tools */}
                        <div className="flex items-center gap-1">
                            {isPending ? (
                                <>
                                    <Spinner />
                                </>
                            ) : (
                                <ModelSelector
                                    models={models?.models}
                                    selectedModelId={activeModelId}
                                    onModelSelect={setSelectedModel}
                                    className="ml-1"
                                />
                            )}
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={!message.trim() || isChatPending}
                            size="sm"
                            variant={message.trim() ? "default" : "ghost"}
                            className="h-8 w-8 p-0 rounded-full "
                            aria-label="Send message"
                            title={
                                message.trim() ? "Send message" : "Enter a message to enable"
                            }
                        >
                            {isChatPending ? <>
                                <Spinner />
                            </> : <>
                                <Send className="h-4 w-4" />
                                <span className="sr-only">Send message</span>
                            </>
                            }
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    )
}

export default ChatMessageForm
