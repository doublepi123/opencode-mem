import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const fixtureUrl = new URL("./fixtures/v2-provider-refresh.mjs", import.meta.url);

/**
 * Spawns the fixture in an isolated process (real src/index.js plugin, real
 * v2 adapter → toLegacyEvent → legacy.event path, real opencode-provider
 * module state) with HOME/XDG redirected under the OS temp sandbox so no
 * real auth, memory DB, or log file is touched.
 */
function runScenario(scenario: string) {
  const dir = mkdtempSync(join(tmpdir(), "opencode-mem-provider-refresh-"));
  tempDirs.push(dir);
  const result = Bun.spawnSync({
    cmd: [process.execPath, fixtureUrl.pathname, scenario],
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: dir,
      XDG_CONFIG_HOME: join(dir, ".config"),
      XDG_DATA_HOME: join(dir, ".local", "share"),
      XDG_STATE_HOME: join(dir, ".local", "state"),
      XDG_CACHE_HOME: join(dir, ".cache"),
      OPENCODE_MEM_LOG_FILE: join(dir, "opencode-mem.log"),
    },
  });
  const stdout = Buffer.from(result.stdout).toString("utf8").trim();
  return {
    exitCode: result.exitCode,
    stderr: Buffer.from(result.stderr).toString("utf8").trim(),
    parsed: stdout ? JSON.parse(stdout) : null,
  };
}

describe("provider connectivity snapshot refresh (late provider registration)", () => {
  it("bootstraps with only 'opencode', then refreshes through the real event path", () => {
    const result = runScenario("bootstrap");

    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    expect(result.parsed?.initSettled).toBe(true);
    expect(result.parsed?.afterInitOnlyOpencode).toBe(true);
    // After provider.updated is delivered via ctx.event.subscribe → adapter
    // → toLegacyEvent → legacy.event, the snapshot includes newapi.
    expect(result.parsed?.afterEventNewapi).toBe(true);
    expect(result.parsed?.eventListCalls).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("refresh-on-miss: one refresh resolves a late provider; ghosts stay false", () => {
    const result = runScenario("miss");

    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    expect(result.parsed?.initSettled).toBe(true);
    // fixture encodes missGhost = (ensure("ghost") === false); true means the
    // ghost really stayed disconnected after its refresh.
    expect(result.parsed?.missGhost).toBe(true);
    expect(result.parsed?.missNewapi).toBe(true);
    // one refresh per miss: call #2 for newapi, call #3 for the ghost
    expect(result.parsed?.callsAfterMiss).toBe(2);
    expect(result.parsed?.finalCalls).toBe(3);
  }, 30_000);

  it("capture path throws the existing 'not connected' error after a failed miss refresh", () => {
    const result = runScenario("capture-error");

    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    // The toast is the 100-char-truncated "Summary generation failed:
    // <existing message>"; the underlying error text must be unchanged.
    expect(result.parsed?.toastMessage).toContain("Summary generation failed:");
    expect(result.parsed?.toastMessage).toContain(
      "opencode provider 'newapi' is not connected. Check your opencode provider"
    );
    expect(result.parsed?.failedAttempts).toBe(1);
    expect(result.parsed?.released).toBe(true);
    expect(result.parsed?.refreshCalls).toBe(1);
  }, 30_000);

  it("keeps the previous set when a refresh errors; the event handler never throws", () => {
    const result = runScenario("refresh-error");

    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    expect(result.parsed?.initSettled).toBe(true);
    expect(result.parsed?.refreshAttempted).toBe(true);
    expect(result.parsed?.newapiStillConnected).toBe(true);
    expect(result.parsed?.errorLogged).toBe(true);
    expect(result.parsed?.listCalls).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("coalesces a burst of provider/model events into a bounded number of refreshes", () => {
    const result = runScenario("burst");

    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    expect(result.parsed?.refreshed).toBe(true);
    // 12 events (provider.updated + model.updated interleaved) must trigger
    // far fewer refresh calls than events — at most one in-flight refresh
    // plus a trailing coalesced one per settle.
    expect(result.parsed?.listCalls).toBeLessThan(8);
    expect(result.parsed?.listCalls).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("no refresh after dispose", () => {
    const result = runScenario("dispose");

    expect([result.exitCode, result.stderr]).toEqual([0, ""]);
    expect(result.parsed?.callsBeforeDispose).toBe(1);
    expect(result.parsed?.callsAfterDisposeEvent).toBe(1);
    // ensureProviderConnected without a registered refresher must stay a
    // pure set lookup and not throw after dispose.
    expect(result.parsed?.ghostFalseAfterDispose).toBe(true);
    expect(result.parsed?.opencodeStillConnected).toBe(true);
  }, 30_000);
});
