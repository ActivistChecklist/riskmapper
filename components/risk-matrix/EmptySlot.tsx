import React from "react";
import { cn } from "@/lib/utils";

/**
 * The dashed spot where a step's own entries will appear, saying how to
 * fill it. It stays while an example is showing, under the example, so
 * it is clear the example isn't the person's and what to do instead.
 */
export default function EmptySlot({
  children,
  action,
  className,
  textClassName,
}: {
  children: React.ReactNode;
  /** A control under the text, such as the guidance's Show examples. */
  action?: React.ReactNode;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div
      data-empty-slot
      className={cn(
        "flex flex-col items-center justify-center rounded-lg rm-dashed px-4 py-4",
        className,
      )}
    >
      <p
        className={cn(
          "max-w-[20rem] text-center text-[13px] leading-snug italic text-rm-muted-2 sm:text-sm sm:leading-relaxed",
          textClassName,
        )}
      >
        {children}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
