/** Shared Tailwind class fragments for the explorer chrome. */

export const ACTIVE_ACCENT = "bg-primary/15 text-primary";

export const HOVER_SURFACE = "hover:bg-surface-hover hover:text-foreground-bright";

export const ICON_WELL = `inline-flex items-center justify-center rounded-xl ${ACTIVE_ACCENT}`;

/** Dense icon inside inputs (search affordance) — matches FIELD_INPUT h-10. */
export const ICON_BTN_DENSE = "size-10 rounded-xl";

/** Minimum interactive hit area (~40px; close to 44px a11y target). */
export const HIT_TARGET = "size-10";
export const HIT_TARGET_SM = "size-9";

/** Standard icon sizes — prefer these over ad-hoc sizes. */
export const ICON_XS = "size-3";
export const ICON_SM = "size-3.5";
export const ICON = "size-4";

/** Inline flex gaps. */
export const GAP_TIGHT = "gap-1.5";
export const GAP = "gap-2";
export const GAP_LOOSE = "gap-3";
export const GAP_WIDE = "gap-4";

/** Vertical stacks. */
export const STACK_DENSE = "space-y-1";
export const STACK_DENSE_MD = "space-y-1.5";
export const STACK_TIGHT = "space-y-2";
export const STACK = "space-y-3";
/** Dialog / form field groups. */
export const STACK_FORM = "space-y-4";
export const STACK_LOOSE = "space-y-6";
/** Profile section rhythm (Preferences / Patterns / Workflows). */
export const STACK_SECTION = "space-y-8";

/** Text field shell (h-10 / rounded-xl / page bg). */
export const FIELD_INPUT =
  "w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground-bright focus-ring";

export const SURFACE_CARD = "rounded-xl border border-border bg-card";

/** Card body padding (memory / profile item tiles). */
export const CARD_PAD = "px-3 py-3";

/** Compact meta chips (Total count, profile prompts · date). */
export const META_CHIP =
  "inline-flex items-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs tabular-nums text-muted-foreground";

/** Sidebar / chrome nav row (Project, Profile). */
export const NAV_ITEM =
  "flex w-full items-center rounded-xl text-sm font-semibold transition-colors";

/** Horizontal page gutter. */
export const PAGE_GUTTER = "px-[clamp(16px,3vw,40px)]";

/** Header row — compact `px-3 md:px-4`, not the page clamp. */
export const HEADER_GUTTER = "px-3 md:px-4";

/** Toolbar under the header line — same left/right rhythm as the page shell. */
export const PAGE_TOOLBAR = `flex flex-col ${GAP_LOOSE} -mx-[clamp(16px,3vw,40px)] mb-4 ${PAGE_GUTTER} py-3`;

/** Page content shell — full-bleed, no max-width. */
export const PAGE_SHELL =
  "mx-auto w-full max-w-none flex-1 " + STACK_LOOSE + " pt-3 pb-12 " + PAGE_GUTTER;

/** Inner spacing helper when not using BorderedPanel. */
export const PANEL = "rounded-xl border border-border bg-card p-4 " + STACK;
