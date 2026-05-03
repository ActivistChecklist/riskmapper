import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-rm-ring",
  {
    variants: {
      variant: {
        default: "bg-rm-actions text-rm-actions-fg hover:opacity-90",
        primary: "bg-rm-primary text-rm-primary-fg hover:bg-rm-primary-hover",
        outline:
          "border border-rm-border-strong bg-rm-surface text-rm-ink hover:bg-rm-surface-hover",
        /** Muted strip / toolbar — borderless, hover wash (shadcn-style ghost). */
        ghost:
          "border border-transparent bg-transparent text-rm-ink hover:bg-rm-surface-hover active:bg-rm-surface-hover-2",
        destructive:
          "border border-transparent bg-red-600 text-white hover:bg-red-700 focus-visible:ring-rm-ring dark:bg-red-700 dark:hover:bg-red-600",
        destructiveOutline:
          "group border border-rm-border-strong bg-rm-surface text-rm-ink hover:border-red-300 hover:bg-red-50 hover:text-red-950 focus-visible:ring-rm-ring dark:hover:border-red-900/70 dark:hover:bg-red-950/40 dark:hover:text-red-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-6 text-base font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
