import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Regression coverage for the profile-analysis system prompt mode. The same
// analysis is served through two transports:
//   - the OpenCode structured-output path (no tools exist there; a tool
//     instruction makes obedient models stall with a preamble instead of
//     returning JSON), and
//   - the external-API tool-call path (provider.executeToolCall with the
//     update_user_profile tool schema, which REQUIRES the tool instruction).
// The scenario subprocesses below capture the system prompt each path sends.

const tempDirs: string[] = [];

const learningUrl = new URL("../src/services/user-memory-learning.js", import.meta.url).href;
const configUrl = new URL("../src/config.js", import.meta.url).href;
const tagsUrl = new URL("../src/services/tags.js", import.meta.url).href;
const promptManagerUrl = new URL(
  "../src/services/user-prompt/user-prompt-manager.js",
  import.meta.url
).href;
const profileManagerUrl = new URL(
  "../src/services/user-profile/user-profile-manager.js",
  import.meta.url
).href;
const opencodeProviderLoaderUrl = new URL(
  "../src/services/ai/opencode-provider-loader.js",
  import.meta.url
).href;
const profileLlmClientUrl = new URL("../src/services/ai/profile-llm-client.js", import.meta.url)
  .href;
const aiProviderFactoryUrl = new URL("../src/services/ai/ai-provider-factory.js", import.meta.url)
  .href;
const providerConfigUrl = new URL("../src/services/ai/provider-config.js", import.meta.url).href;
const loggerUrl = new URL("../src/services/logger.js", import.meta.url).href;

const PROMPTS = [
  "Fix the bug in the login function",
  "Add tests for the user service",
  "Explain why the build is failing",
  "Refactor the payments module",
  "Review the changes on this branch",
];

function runPromptModeScenario(mode: "opencode" | "external") {
  const dir = mkdtempSync(join(tmpdir(), "opencode-mem-profile-promptmode-"));
  tempDirs.push(dir);
  const scriptPath = join(dir, "scenario.mjs");
  const script = `
import { mock } from "bun:test";

const prompts = ${JSON.stringify(PROMPTS)}.map((content, i) => ({
  id: \`prompt-\${i}\`,
  sessionId: "session-1",
  messageId: \`msg-\${i}\`,
  projectPath: "/workspace",
  content,
  createdAt: i + 1,
  captured: false,
  user_learning_captured: false,
  capture_attempts: 0,
}));

mock.module(${JSON.stringify(configUrl)}, () => ({
  CONFIG: {
    autoCaptureProviderStatus: { ready: true, mode: "opencode", issues: [] },
    userProfileAnalysisInterval: prompts.length,
    showUserProfileToasts: false,
    storagePath: ${JSON.stringify(dir)},
    opencodeTimeoutMs: 90000,
    ${
      mode === "opencode"
        ? `opencodeProvider: "test-provider",
    opencodeModel: "test-model",`
        : `memoryModel: "gpt-4o-mini",
    memoryApiUrl: "https://api.example.test/v1",
    memoryApiKey: "sk-test",`
    }
  },
  outerStructuredOutputTimeoutMs: (configured) => (configured ?? 90000) + 30000,
  OPENCODE_TIMEOUT_MS_DEFAULT: 90000,
}));

mock.module(${JSON.stringify(tagsUrl)}, () => ({
  getTags: () => ({
    user: {
      tag: "opencode_user_test",
      displayName: "Test User",
      userName: "tester",
      userEmail: "test@example.com",
    },
  }),
}));

mock.module(${JSON.stringify(promptManagerUrl)}, () => ({
  userPromptManager: {
    countUnanalyzedForUserLearning: async () => prompts.length,
    getPromptsForUserLearning: async () => prompts,
    markMultipleAsUserLearningCaptured: async () => {},
  },
}));

mock.module(${JSON.stringify(profileManagerUrl)}, () => ({
  userProfileManager: {
    getActiveProfile: async () => null,
    createProfile: async () => ({}),
    mergeProfileData: async () => ({}),
    updateProfile: async () => true,
    decayInMemory: (d) => ({ data: d }),
    syncConfidence: () => {},
  },
}));

mock.module(${JSON.stringify(loggerUrl)}, () => ({ log: () => {} }));

let structuredSystemPrompt = null;
let externalSystemPrompt = null;

mock.module(${JSON.stringify(opencodeProviderLoaderUrl)}, () => ({
  loadOpencodeProvider: async () => ({
    generateStructuredOutput: async ({ systemPrompt }) => {
      structuredSystemPrompt = systemPrompt;
      return { preferences: [], patterns: [], workflows: [] };
    },
  }),
}));

mock.module(${JSON.stringify(profileLlmClientUrl)}, () => ({
  getOpenCodeClient: async () => ({}),
}));

mock.module(${JSON.stringify(providerConfigUrl)}, () => ({
  buildMemoryProviderConfig: () => ({}),
}));

mock.module(${JSON.stringify(aiProviderFactoryUrl)}, () => ({
  AIProviderFactory: {
    createProvider: () => ({
      executeToolCall: async (systemPrompt) => {
        externalSystemPrompt = systemPrompt;
        return { success: true, data: { preferences: [], patterns: [], workflows: [] } };
      },
    }),
  },
}));

try {
  const { performUserProfileLearning } = await import(${JSON.stringify(learningUrl)});
  await performUserProfileLearning({}, "/workspace");
  console.log(JSON.stringify({ error: null, structuredSystemPrompt, externalSystemPrompt }));
} catch (e) {
  console.log(JSON.stringify({ error: e?.message ?? String(e), structuredSystemPrompt, externalSystemPrompt }));
}
process.exit(0);
`;

  writeFileSync(scriptPath, script, "utf-8");
  const result = Bun.spawnSync({
    cmd: [process.execPath, scriptPath],
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
    parsed: jsonLine
      ? (JSON.parse(jsonLine) as {
          error: string | null;
          structuredSystemPrompt: string | null;
          externalSystemPrompt: string | null;
        })
      : null,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("user profile learning system prompt mode", () => {
  it("opencode structured-output path: no tool instruction, JSON-object instruction instead", () => {
    const result = runPromptModeScenario("opencode");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.error).toBeNull();
    expect(result.parsed?.structuredSystemPrompt).toBeTruthy();
    // No tool mention: on the v2 Generate API no tools exist, and the model
    // obeying the old sentence stalled with a preamble and no JSON.
    expect(result.parsed?.structuredSystemPrompt).not.toContain("update_user_profile");
    expect(result.parsed?.structuredSystemPrompt).not.toContain("tool");
    // The model must be told to answer with the profile JSON itself.
    expect(result.parsed?.structuredSystemPrompt).toContain("JSON object");
  });

  it("external tool-call path: keeps the update_user_profile tool instruction", () => {
    const result = runPromptModeScenario("external");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.error).toBeNull();
    expect(result.parsed?.externalSystemPrompt).toBeTruthy();
    expect(result.parsed?.externalSystemPrompt).toContain(
      "Use the update_user_profile tool to save the new profile."
    );
  });
});
