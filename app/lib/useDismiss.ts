"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Closes a popover on an outside click or Escape.
 *
 * Deliberately a document-level listener rather than a full-screen overlay.
 * The header applies `backdrop-blur`, and `backdrop-filter` makes an element a
 * containing block for `position: fixed` descendants — so an `inset-0` overlay
 * rendered inside the header only ever covers the header itself, and clicking
 * anywhere on the page below it did nothing.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    // Capture phase, so a click is caught even if something below stops it.
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}
