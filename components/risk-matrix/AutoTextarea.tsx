"use client";

import React, { useLayoutEffect, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type AutoTextareaProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  lineId?: string;
  subLineId?: string;
  riskLineId?: string;
  /** Extra Tailwind / utility classes for the textarea */
  className?: string;
};

const baseTextareaClass =
  "w-full min-w-0 border-0 bg-transparent p-1.5 px-1.5 font-[inherit] text-[15px] leading-[1.5] text-inherit outline-none resize-none overflow-hidden";

const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  function AutoTextarea(
    {
      value,
      onChange,
      onKeyDown,
      onBlur,
      placeholder,
      lineId,
      subLineId,
      riskLineId,
      className,
    },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = (el: HTMLTextAreaElement | null) => {
      localRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };
    useLayoutEffect(() => {
      const el = localRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [value]);

    useEffect(() => {
      const el = localRef.current;
      if (!el) return;

      const syncHeight = () => {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      };

      const onWindowResize = () => {
        window.requestAnimationFrame(syncHeight);
      };

      window.addEventListener("resize", onWindowResize);

      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => {
          window.requestAnimationFrame(syncHeight);
        });
        ro.observe(el);
      }

      return () => {
        window.removeEventListener("resize", onWindowResize);
        ro?.disconnect();
      };
    }, [value, className]);

    const dataAttrs: Record<string, string> = {};
    if (lineId) dataAttrs["data-line-id"] = lineId;
    if (subLineId) dataAttrs["data-sub-line-id"] = subLineId;
    if (riskLineId) dataAttrs["data-risk-line-id"] = riskLineId;

    return (
      <textarea
        ref={setRefs}
        {...dataAttrs}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={1}
        className={cn(baseTextareaClass, className)}
      />
    );
  },
);

AutoTextarea.displayName = "AutoTextarea";

export default AutoTextarea;
