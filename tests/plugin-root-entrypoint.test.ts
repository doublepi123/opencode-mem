import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";

const rootIndex = new URL("../index.js", import.meta.url);
const distPlugin = new URL("../dist/plugin.js", import.meta.url);

describe("local checkout root entrypoint", () => {
  // OpenCode loads a directory plugin by falling back to `<dir>/index` and does
  // not read `package.json` `exports`/`main` for a path spec on current
  // releases. Without a root entrypoint the checkout is skipped silently, so a
  // local install never loads. See README "Using a local checkout".
  it("ships a root index.js that re-exports the built v2 plugin", () => {
    expect(existsSync(rootIndex)).toBe(true);
  });

  it("resolves to the same v2 plugin definition as dist/plugin.js", async () => {
    const root = await import(rootIndex.href);
    const dist = await import(distPlugin.href);
    expect(root.default).toBeDefined();
    expect(root.default.id).toBe("opencode-mem");
    expect(typeof root.default.setup).toBe("function");
    expect(typeof root.default.server).toBe("function");
    expect(root.default.id).toBe(dist.default.id);
  });
});
