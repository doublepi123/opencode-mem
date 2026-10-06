import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "opencode-mem-child-capture-"));
let result: any;

afterAll(() => rmSync(directory, { recursive: true, force: true }));

beforeAll(() => {
  // Isolate module mocks from the suite. Drive the real shared plugin and
  // V2 adapter with no database, provider calls, or actual host sessions.
  const child = Bun.spawnSync([
    process.execPath,
    fileURLToPath(new URL("./fixtures/child-session-capture.mjs", import.meta.url)),
    directory,
  ]);
  expect(child.exitCode).toBe(0);
  expect(child.stderr.toString()).toBe("");
  result = JSON.parse(child.stdout.toString().trim());
});

const savedSessionIDs = () => result.captures.map((capture: any) => capture.sessionID);

describe("subagent child-session prompt capture", () => {
  it("does not save child-session prompts by default (V1 chat.message)", () => {
    expect(savedSessionIDs()).not.toContain("v1-child");
  });

  it("does not save child-session prompts by default (V2 memoryContext.capturePrompt)", () => {
    expect(savedSessionIDs()).not.toContain("v2-child");
  });

  it("still saves top-level session prompts by default", () => {
    expect(savedSessionIDs()).toContain("v1-top");
    expect(savedSessionIDs()).toContain("v2-top");
  });

  it("saves child-session prompts when captureChildSessions is true", () => {
    expect(savedSessionIDs()).toContain("v1-opt");
    expect(savedSessionIDs()).toContain("v2-opt");
  });

  it("fails open and saves the prompt when session.get fails", () => {
    expect(savedSessionIDs()).toContain("v1-fail");
  });

  it("looks the session up once per sessionID (repeated messages reuse the cache)", () => {
    expect(result.sessionGetCalls["v1-cache"]).toBe(1);
  });

  it("checks the session on the first prompt only for top-level sessions too", () => {
    expect(result.sessionGetCalls["v1-top"]).toBe(1);
  });
});
