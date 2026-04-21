"use client";;
import { ChatActionButton, chatActionButtonClassName } from "@/components/ui/chat-action-button";
import {
  ScrollArea,
  ScrollBar,
} from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

export const Suggestions = ({
  className,
  children,
  ...props
}) => (
  <ScrollArea className="w-full overflow-x-auto whitespace-nowrap" {...props}>
    <div className={cn("flex w-max flex-nowrap items-center gap-2", className)}>
      {children}
    </div>
    <ScrollBar className="hidden" orientation="horizontal" />
  </ScrollArea>
);

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  autoSubmit = false,
  children,
  ...props
}) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion, { autoSubmit });
  }, [autoSubmit, onClick, suggestion]);

  return (
    <ChatActionButton
      className={cn(chatActionButtonClassName, "w-auto shrink-0 cursor-pointer", className)}
      onClick={handleClick}
      type="button"
      {...props}>
      {children || suggestion}
    </ChatActionButton>
  );
};
