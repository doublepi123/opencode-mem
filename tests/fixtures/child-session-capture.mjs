import { mock } from "bun:test";

const moduleUrl = (path) => new URL("../../src/" + path + ".js", import.meta.url).href;
const config = {
  chatMessage: {
    enabled: true,
    injectOn: "first",
    maxMemories: 3,
    excludeCurrentSession: true,
    filterInjectedPrompts: true,
    captureChildSessions: false,
  },
  compaction: { enabled: false },
  autoCaptureEnabled: false,
  webServerEnabled: false,
  autoUpdate: { enabled: false },
  storagePath: process.argv[2],
  opencodeModel: "inherit",
};
const captures = [];
const sessionGetCalls = [];
// sessionID -> { parentID?: string, failGet?: boolean }
const childSessions = new Map();

mock.module(moduleUrl("config"), () => ({
  CONFIG: config,
  initConfig() {},
  isConfigured: () => true,
}));
mock.module(moduleUrl("services/client"), () => ({
  memoryClient: {
    warmup: async () => {},
    close: async () => {},
    listMemories: async () => ({ success: true, memories: [] }),
  },
}));
mock.module(moduleUrl("services/tags"), () => ({
  getTags: () => ({
    project: { tag: "fixture-project" },
    user: { userEmail: "fixture-user" },
  }),
}));
mock.module(moduleUrl("services/context"), () => ({
  formatContextForPrompt: async () => "",
}));
mock.module(moduleUrl("services/user-prompt/user-prompt-manager"), () => ({
  userPromptManager: {
    savePrompt: async (...args) => captures.push(args),
    setPromptModel: async () => {},
  },
}));
mock.module(moduleUrl("services/logger"), () => ({ log() {} }));
mock.module(moduleUrl("services/web-server"), () => ({
  startWebServer: async () => null,
  WebServer: class {},
}));
mock.module(moduleUrl("services/auto-update"), () => ({ startAutoUpdate() {} }));

const { OpenCodeMemPlugin } = await import(moduleUrl("index"));
const { registerV2Adapter } = await import(moduleUrl("v2/adapter"));

const client = {
  provider: { list: async () => ({ data: { connected: [] } }) },
  session: {
    get: async ({ path }) => {
      sessionGetCalls.push(path.id);
      const session = childSessions.get(path.id);
      if (session?.failGet) throw new Error("session.get failed");
      return {
        data: {
          id: path.id,
          title: "subagent task",
          ...(session?.parentID ? { parentID: session.parentID } : {}),
        },
      };
    },
    messages: async () => ({ data: [] }),
  },
};

const plugin = await OpenCodeMemPlugin({ directory: "/fixture-project", client });

async function v2Adapter() {
  const hooks = new Map();
  const cleanup = await registerV2Adapter(
    {
      location: {
        directory: "/fixture-project",
        project: { directory: "/fixture-project" },
      },
      tool: { transform: async () => {} },
      session: { hook: async (name, callback) => hooks.set(name, callback) },
    },
    { ...plugin, event: undefined, dispose: undefined }
  );
  return {
    async prompt(sessionID, text, id) {
      await hooks.get("prompt")({ sessionID, messageID: id, prompt: { text } });
    },
    cleanup,
  };
}

async function v1Prompt(sessionID, messageID, text) {
  await plugin["chat.message"](
    { sessionID },
    { message: { id: messageID }, parts: [{ type: "text", text }] }
  );
}

const output = {};

// Default: captureChildSessions false (V1 chat.message).
childSessions.set("v1-child", { parentID: "ses_parent" });
childSessions.set("v1-top", {});
await v1Prompt("v1-child", "m-child", "orchestrator prompt");
await v1Prompt("v1-top", "m-top", "human prompt");

// Repeated messages in one session hit session.get once (lookup cache).
childSessions.set("v1-cache", { parentID: "ses_parent" });
for (let i = 0; i < 3; i++) {
  await v1Prompt("v1-cache", `m-cache-${i}`, `repeat ${i}`);
}

// Lookup failure fails open: the prompt is still saved.
childSessions.set("v1-fail", { parentID: "ses_parent", failGet: true });
await v1Prompt("v1-fail", "m-fail", "fail-open prompt");

// Default: V2 memoryContext.capturePrompt bridge.
const host = await v2Adapter();
childSessions.set("v2-child", { parentID: "ses_parent" });
childSessions.set("v2-top", {});
await host.prompt("v2-child", "v2 orchestrator prompt", "mv2-child");
await host.prompt("v2-top", "v2 human prompt", "mv2-top");
await host.cleanup();

// Opt-in: captureChildSessions true.
config.chatMessage.captureChildSessions = true;
childSessions.set("v1-opt", { parentID: "ses_parent" });
await v1Prompt("v1-opt", "m-opt", "opt-in child prompt");
const host2 = await v2Adapter();
childSessions.set("v2-opt", { parentID: "ses_parent" });
await host2.prompt("v2-opt", "v2 opt-in child prompt", "mv2-opt");
await host2.cleanup();

output.captures = captures.map(([sessionID, messageID, , text]) => ({
  sessionID,
  messageID,
  text,
}));
output.sessionGetCalls = sessionGetCalls.reduce((acc, id) => {
  acc[id] = (acc[id] ?? 0) + 1;
  return acc;
}, {});
await plugin.dispose();
console.log(JSON.stringify(output));
