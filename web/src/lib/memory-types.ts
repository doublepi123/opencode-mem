export const MEMORY_TYPES = [
  "",
  "feature",
  "bug-fix",
  "refactor",
  "architecture",
  "rule",
  "documentation",
  "discussion",
  "analysis",
  "configuration",
] as const;

export type MemoryTypeOption = (typeof MEMORY_TYPES)[number];
