import type { Plugin } from "@opencode/plugin/promise/plugin";
import { OpenCodeMemPlugin } from "../index.js";
import { CONFIG } from "../config.js";
import { loadOpencodeProvider } from "../services/ai/opencode-provider-loader.js";
import { registerV2Adapter } from "./adapter.js";
import { createLegacyClient } from "./legacy-client.js";

const OpenCodeMemPluginV2: Plugin = {
  id: "opencode-mem",
  async setup(ctx) {
    const legacyClient = createLegacyClient(ctx);
    const legacy = (await OpenCodeMemPlugin({
      client: legacyClient,
      directory: ctx.location.directory,
      worktree: ctx.location.project.directory,
      project: ctx.location.project,
      serverUrl: undefined,
    } as any)) as any;

    // The V1 initializer cannot discover a server URL from a native V2
    // context. Route internal structured-output calls through the adapter.
    const { setV2Client, setStructuredOutputTimeoutConfig } = await loadOpencodeProvider();
    setV2Client(legacyClient);
    // Same timeout wiring as the V1 init path (configureOpencodeHostTransport):
    // the bundled provider module must not import config.js itself.
    setStructuredOutputTimeoutConfig(CONFIG.opencodeTimeoutMs);

    return registerV2Adapter(ctx, legacy);
  },
};

export default OpenCodeMemPluginV2;
