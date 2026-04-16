"use client"

import React from 'react'
import { useState, useEffect } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'

const ChatMessageForm = ({ initialMessage, onMessageChange }) => {

    const [message, setMessage] = useState("");

    useEffect(() => {
        if (initialMessage) {
            setMessage(initialMessage)
            onMessageChange?.("")
        }
    }, [initialMessage, onMessageChange])

    const handleSubmit = async (e) => {
        try {
            e.preventDefault();
            console.log("Message sent");
        } catch (error) {
            console.log(error);
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
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                    />

                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t ">
                        {/* Left side tools */}
                        <div className="flex items-center gap-1">
                            <Button variant={"outline"}>Select a Model</Button>
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={!message.trim()}
                            size="sm"
                            variant={message.trim() ? "default" : "ghost"}
                            className="h-8 w-8 p-0 rounded-full "
                            aria-label="Send message"
                            title={
                                message.trim() ? "Send message" : "Enter a message to enable"
                            }
                        >
                            <Send className="h-4 w-4" />
                            <span className="sr-only">Send message</span>
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    )
}

export default ChatMessageForm
