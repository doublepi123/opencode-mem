import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Run the real idle handler with model, database and timer boundaries replaced.
// This keeps the regression independent of embedding downloads and live services.
const source = new Bun.Transpiler({ loader: "ts" }).transformSync(
  readFileSync(new URL("../src/index.ts", import.meta.url), "utf8")
);
const start = source.indexOf('if (event.type === "session.idle")');
const end = source.indexOf('if (event.type === "session.compacted")', start);
if (start < 0 || end < 0) throw new Error("Idle handler not found");
const handler = source
  .slice(start, end)
  .replace('await import("./services/cleanup-service.js")', "({ cleanupService: mockCleanup })");

async function runScenario({ owner = false, web = true, internal = false, enabled = true } = {}) {
  const calls: string[] = [];
  let callback: (() => Promise<void>) | undefined;
  const sandbox = {
    event: { type: "session.idle", properties: { sessionID: "user-session" } },
    CONFIG: { autoCaptureEnabled: enabled },
    isConfigured: () => true,
    isInternalCaptureSession: async () => internal,
    ctx: { client: {} },
    directory: "/active-project",
    webServer: web ? { isServerOwner: () => owner } : null,
    idleTimeout: null,
    setTimeout: (fn: () => Promise<void>) => {
      callback = fn;
      return 1;
    },
    clearTimeout: () => {},
    performAutoCapture: async () => calls.push("capture"),
    performUserProfileLearning: async () => calls.push("learn"),
    mockCleanup: {
      shouldRunCleanup: async () => true,
      runCleanup: async () => calls.push("cleanup"),
    },
    log: () => {},
  };
  await runInNewContext(`(async () => { ${handler} })()`, sandbox);
  await callback?.();
  return calls;
}

describe("profile learning on session idle", () => {
  it("learns from an active project that does not own the web server", async () => {
    expect(await runScenario()).toEqual(["capture", "learn"]);
  });

  it("learns when the web UI is disabled", async () => {
    expect(await runScenario({ web: false })).toEqual(["capture", "learn"]);
  });

  it("retains owner-only cleanup", async () => {
    expect(await runScenario({ owner: true })).toEqual(["capture", "learn", "cleanup"]);
  });

  it("does not recursively learn from internal model sessions", async () => {
    expect(await runScenario({ internal: true })).toEqual([]);
  });

  it("does not start background work when capture is disabled", async () => {
    expect(await runScenario({ enabled: false })).toEqual([]);
  });
});
