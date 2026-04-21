import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const chatActionButtonClassName =
  "h-8 justify-start rounded-lg px-2.5 text-sm font-medium transition-all";

export function ChatActionButton({ className, ...props }) {
  return (
    <Button
      className={cn(chatActionButtonClassName, className)}
      size="default"
      variant="default"
      {...props}
    />
  );
}
