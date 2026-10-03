import { describe, expect, test } from "bun:test";
import { getDisplayedMemoryCount } from "../web/src/lib/memory-count";

describe("getDisplayedMemoryCount", () => {
  test("shows matched results while search is active", () => {
    expect(getDisplayedMemoryCount(true, 3, 120)).toBe(3);
    expect(getDisplayedMemoryCount(true, 0, 120)).toBe(0);
  });

  test("restores the store total when search is cleared", () => {
    expect(getDisplayedMemoryCount(false, 3, 120)).toBe(120);
  });

  test("shows the filtered total when a tag filter is active", () => {
    expect(getDisplayedMemoryCount(false, 3, 120, true)).toBe(3);
    expect(getDisplayedMemoryCount(false, 0, 120, true)).toBe(0);
  });

  test("prefers search total when both search and tag filter are active", () => {
    expect(getDisplayedMemoryCount(true, 2, 120, true)).toBe(2);
  });

  test("keeps the store total when no search and no tag filter", () => {
    expect(getDisplayedMemoryCount(false, 3, 120, false)).toBe(120);
  });
});
