import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
  );
}

/**
 * While true, every Tooltip below stays closed. Used during a drag so the
 * pointer sweeping over stars and buttons doesn't pop their hints.
 */
const TooltipsSuppressedContext = React.createContext(false);

function SuppressTooltips({
  when,
  children,
}: {
  when: boolean;
  children: React.ReactNode;
}) {
  return (
    <TooltipsSuppressedContext.Provider value={when}>
      {children}
    </TooltipsSuppressedContext.Provider>
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const suppressed = React.useContext(TooltipsSuppressedContext);
  return (
    <TooltipPrimitive.Root {...props} open={suppressed ? false : props.open} />
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-64 rounded-md border border-black/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-md dark:border-white/15 dark:bg-zinc-100 dark:text-zinc-900",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export {
  SuppressTooltips,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
};
