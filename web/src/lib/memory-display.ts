import { formatDate } from "./format";
import { CARD_PAD, GAP_TIGHT, STACK, STACK_TIGHT, SURFACE_CARD } from "./ui/styles";
import { cn } from "./utils";
import type { MemoryItem } from "./types";

export function displayInfo(m: MemoryItem): string {
  if (m.projectPath) {
    const pathParts = m.projectPath
      .replace(/\\/g, "/")
      .split("/")
      .filter((p) => p);
    return pathParts[pathParts.length - 1] || m.projectPath;
  }
  return m.displayName || m.id;
}

export function dateInfo(m: MemoryItem) {
  const createdDate = formatDate(m.createdAt);
  const updatedDate = m.updatedAt && m.updatedAt !== m.createdAt ? formatDate(m.updatedAt) : null;
  return { createdDate, updatedDate };
}

export function similarityLabel(m: MemoryItem, asFraction: boolean): string | null {
  if (m.similarity === undefined) return null;
  if (asFraction) return `${Math.round(m.similarity * 100)}%`;
  return `${m.similarity}%`;
}

export function memoryCardClass(opts: {
  selected?: boolean;
  pinned?: boolean;
  spaced?: "tight" | "loose";
}): string {
  return cn(
    SURFACE_CARD,
    CARD_PAD,
    opts.spaced === "loose" ? STACK : STACK_TIGHT,
    opts.selected && "ring-1 ring-primary/40",
    opts.pinned && "border-primary/35"
  );
}

/** In-card heading — not a floating notch (those are for editable form labels only). */
export const CARD_TITLE =
  "m-0 flex max-w-full items-center " + GAP_TIGHT + " text-sm font-semibold text-foreground-bright";
