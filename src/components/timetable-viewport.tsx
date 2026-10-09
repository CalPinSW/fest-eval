"use client";

import { useEffect, useRef, type ReactNode } from "react";

const BOTTOM_GAP_PX = 16;
const MIN_HEIGHT_PX = 320;

/**
 * The timetable's scroll box. It fills the space left on screen below it and
 * scrolls both ways, so its sideways scrollbar is visible without scrolling
 * the page first. Vertical scrolling hands over to the page at the box's
 * edges (to reach the plan below); sideways it doesn't, so a trackpad swipe
 * can't trigger browser back. When `initialScrollTop` is given (today's
 * "now" position), it opens there.
 */
export function TimetableViewport({ children, initialScrollTop }: { children: ReactNode; initialScrollTop?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      const topInPage = box.getBoundingClientRect().top + window.scrollY;
      const available = window.innerHeight - topInPage - BOTTOM_GAP_PX;
      box.style.maxHeight = `${Math.max(MIN_HEIGHT_PX, available)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const box = ref.current;
    if (!box || initialScrollTop === undefined) return;
    // Put "now" about a third of the way down, leaving context above it.
    box.scrollTop = Math.max(0, initialScrollTop - box.clientHeight / 3);
  }, [initialScrollTop]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Timetable"
      tabIndex={0}
      // Before hydration, a CSS approximation of the fitted height.
      className="max-h-[calc(100dvh-6rem)] overflow-auto overscroll-x-contain rounded-2xl border border-border bg-surface focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </div>
  );
}
