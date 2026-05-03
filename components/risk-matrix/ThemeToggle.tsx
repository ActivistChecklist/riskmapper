"use client";

import React, { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  readStoredPreference,
  resolvePreference,
  writeStoredPreference,
  type ThemePreference,
} from "@/lib/theme";

type Option = {
  value: ThemePreference;
  label: string;
  icon: React.ReactNode;
};

const OPTIONS: Option[] = [
  { value: "light", label: "Light", icon: <Sun size={14} aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon size={14} aria-hidden /> },
  { value: "system", label: "System", icon: <Monitor size={14} aria-hidden /> },
];

/**
 * Small theme switcher — light / dark / follow-system.
 *
 * Initial paint is owned by the inline boot script in `app/layout.tsx`,
 * so this component renders only AFTER hydration. We render a stable
 * placeholder during SSR (icon == "Sun") to keep markup deterministic;
 * the icon swaps to the real choice on mount.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage / system once on mount. The boot script
    // in app/layout.tsx already painted the right `.dark` class — we
    // just sync React state to match.
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    const stored = readStoredPreference();
    setPref(stored);
    setResolved(resolvePreference(stored));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // When the OS theme flips and the user is on "system", follow it live.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolvePreference("system");
      setResolved(next);
      applyTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const choose = (next: ThemePreference) => {
    setPref(next);
    writeStoredPreference(next);
    const r = resolvePreference(next);
    setResolved(r);
    applyTheme(r);
  };

  const TriggerIcon = mounted && resolved === "dark" ? Moon : Sun;
  const tooltipLabel = mounted
    ? pref === "system"
      ? `Theme: System (${resolved})`
      : `Theme: ${pref === "light" ? "Light" : "Dark"}`
    : "Theme";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              aria-label={tooltipLabel}
              className={cn("h-8 w-8 px-0", className)}
            >
              <TriggerIcon size={15} strokeWidth={2} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={6}>
        {OPTIONS.map((opt) => {
          const isActive = pref === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => choose(opt.value)}
              className={cn(
                "flex items-center gap-2",
                isActive && "font-semibold text-rm-primary",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-4 place-items-center",
                  isActive ? "text-rm-primary" : "text-rm-muted",
                )}
              >
                {opt.icon}
              </span>
              <span>{opt.label}</span>
              {isActive ? (
                <span className="ml-auto text-xs text-rm-muted-2">active</span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
