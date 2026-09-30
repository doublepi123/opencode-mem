import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * B3 regression: storage faults during stored-profile parse/merge must never
 * be mistaken for provider faults. Runs the REAL performUserProfileLearning
 * and the REAL cross-process lock in real child processes against temp
 * storage; only the external AI boundaries and the profile manager are
 * mocked. The old service fixture pinned getActiveProfile to null, so this
 * path (existing profile → native LLM success → merge) was never covered.
 */
const tempDirs: string[] = [];

afterAll(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const WORKER = new URL("./fixtures/profile-learning-storage-error-worker.mjs", import.meta.url)
  .pathname;

interface RunResult {
  exitCode: number | null;
  stderr: string;
  parsed: Record<string, unknown> | null;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "opencode-mem-storage-error-"));
  tempDirs.push(dir);
  return dir;
}

function runWorker(cfg: Record<string, unknown>): RunResult {
  const dir = tempDir();
  const cfgPath = join(dir, "cfg.json");
  const eventsFile = join(dir, "events.jsonl");
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, storagePath: dir, eventsFile }));

  const result = Bun.spawnSync({
    cmd: [process.execPath, WORKER, cfgPath],
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = Buffer.from(result.stdout).toString("utf8").trim();
  const stderr = Buffer.from(result.stderr).toString("utf8").trim();
  const jsonLine = stdout
    .split("\n")
    .reverse()
    .find((line) => line.trim().startsWith("{"));

  return {
    exitCode: result.exitCode,
    stderr,
    parsed: jsonLine ? JSON.parse(jsonLine) : null,
  };
}

describe("profile learning storage errors are not provider faults (B3)", () => {
  it("native LLM success + merge storage error: no external fallback, no update/mark, error propagates", () => {
    const result = runWorker({ mergeError: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.["error"]).toBe("storage merge failed: simulated cold DB fault");
    // The merge fault must NOT be treated as a provider fault: the external
    // LLM is configured and reachable, yet is never called.
    expect(result.parsed?.["externalCalls"]).toBe(0);
    expect(result.parsed?.["updates"]).toBe(0);
    expect(result.parsed?.["marks"]).toBe(0);
    // The native provider DID succeed before the merge fault.
    expect(result.parsed?.["nativeCalls"]).toBe(1);
    expect(result.parsed?.["merges"]).toBeGreaterThanOrEqual(1);
  });

  it("stored-profile parse failure (corrupt profileData) propagates, no fallback", () => {
    // Corrupt stored profileData: analyzeUserProfile's JSON.parse throws
    // after a native success — outside the provider catch by design.
    const result = runWorker({ corruptProfileData: true });

    expect(result.exitCode).toBe(0);
    expect(result.parsed?.["error"]).toBeTruthy();
    expect(result.parsed?.["externalCalls"]).toBe(0);
    expect(result.parsed?.["updates"]).toBe(0);
    expect(result.parsed?.["marks"]).toBe(0);
  });

  it("native provider failure falls back to external; merge/update/mark proceed", () => {
    const result = runWorker({ nativeError: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.["error"]).toBe(null);
    expect(result.parsed?.["nativeCalls"]).toBe(1);
    expect(result.parsed?.["externalCalls"]).toBe(1);
    expect(result.parsed?.["updates"]).toBe(1);
    expect(result.parsed?.["marks"]).toBe(1);
  });

  it("release completes after a propagated storage error; same process can run again", () => {
    const result = runWorker({ mergeError: true, holdLockFirst: true });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    // First run propagated the storage error...
    expect(result.parsed?.["error"]).toBe("storage merge failed: simulated cold DB fault");
    // ...yet the lock is acquirable again immediately...
    expect(result.parsed?.["reacquired"]).toBe(true);
    // ...and a second run in the same process completes cleanly.
    expect(result.parsed?.["secondRunError"]).toBe(null);
    expect(result.parsed?.["secondRunMarks"]).toBe(1);
  });
});
