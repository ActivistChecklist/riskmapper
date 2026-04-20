"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "border border-black/10 bg-white font-sans text-rm-ink shadow-md",
          title: "text-rm-ink",
          description: "text-rm-ink/80",
          success: "border-emerald-200/80",
          error: "border-red-200/80",
        },
      }}
      closeButton
    />
  );
}
