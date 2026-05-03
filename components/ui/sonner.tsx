"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Dark toasts for high contrast against the light app surface. The
 * stock light-on-light Sonner default was easy to miss when it
 * appeared. Black background + white text reads at a glance and
 * matches the convention most apps use for transient notifications.
 *
 * Per-variant accents (success/error) are kept on the LEFT EDGE only
 * — a colored bar — so the body stays consistent across types.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "border border-white/10 bg-zinc-900 font-sans text-white shadow-lg shadow-black/30",
          title: "text-white font-medium",
          description: "text-white/80",
          actionButton: "bg-white text-zinc-900 hover:bg-zinc-100",
          cancelButton: "bg-white/10 text-white hover:bg-white/15",
          // Sonner places the close button on the LEFT by default. Pin it
          // to the right edge, vertically centered so single- and multi-
          // line toasts both look right (the previous fixed `top-2`
          // landed above-middle on tall toasts).
          closeButton:
            "!left-auto !right-2 !top-1/2 !translate-x-0 !-translate-y-1/2 !bg-zinc-800 !border-white/15 !text-white/85 hover:!bg-zinc-700",
          success: "border-l-4 border-l-emerald-400",
          error: "border-l-4 border-l-red-400",
          info: "border-l-4 border-l-sky-400",
          warning: "border-l-4 border-l-amber-400",
        },
      }}
      closeButton
    />
  );
}
