import { describe, expect, it } from "bun:test";
import {
  createLegacyClient,
  eventBelongsToLocation,
  legacyToolResult,
  toLegacyEvent,
} from "../src/v2/legacy-client.js";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    location: {
      directory: "/workspace/project",
      project: { id: "project", directory: "/workspace/project", canonical: "project" },
    },
    // Native v2 context contract: ctx.provider.list() -> { location, data }
    // with ProviderInfo rows (id + activation). The legacy bridge derives
    // connectivity from this directory, not from model.list.
    provider: {
      list: async () => ({
        location: { directory: "/workspace/project" },
        data: [
          { id: "anthropic", name: "Anthropic", activation: "enabled", package: "anthropic" },
          { id: "openai", name: "OpenAI", activation: "enabled", package: "openai" },
        ],
      }),
    },
    model: {
      list: async () => ({
        data: [
          { providerID: "anthropic", id: "claude" },
          { providerID: "anthropic", id: "claude-fast" },
          { providerID: "openai", id: "gpt" },
        ],
      }),
    },
    generate: {
      text: async () => ({ text: '{"summary":"done","tags":["v2"]}' }),
    },
    session: {
      get: async () => ({ id: "ses", location: { directory: "/workspace/project" } }),
      context: async () => [],
      synthetic: async (input: unknown) => input,
      prompt: async (input: unknown) => input,
      interrupt: async () => ({ interrupted: true }),
    },
    ...overrides,
  } as any;
}

describe("OpenCode v2 legacy client bridge", () => {
  it("reports providers with active models from the provider directory", async () => {
    // Connectivity comes from ctx.provider.list() (activation auto/enabled);
    // model.list is no longer the source (broker 'opencode' hid real ids).
    // model.list throws here if ever consulted.
    const ctx = createContext({
      model: {
        list: async () => {
          throw new Error("model.list must not be called");
        },
      },
    });
    const client = createLegacyClient(ctx);
    const result = await client.provider.list();
    expect(result.data.connected).toEqual(["anthropic", "openai"]);
  });

  it("preserves create/prompt/delete structured-output semantics", async () => {
    let generationInput: any;
    const ctx = createContext({
      generate: {
        text: async (input: any) => {
          generationInput = input;
          return { text: '```json\n{"summary":"done","tags":["v2"]}\n```' };
        },
      },
    });
    const client = createLegacyClient(ctx);

    const created = await client.session.create({ title: "capture" });
    const sessionID = created.data.id;
    const result = await client.session.prompt({
      sessionID,
      model: { providerID: "anthropic", modelID: "claude" },
      system: "Summarize the work.",
      parts: [{ type: "text", text: "Implemented OpenCode v2." }],
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { summary: { type: "string" }, tags: { type: "array" } },
          required: ["summary", "tags"],
        },
      },
    });

    expect(generationInput.model).toEqual({ providerID: "anthropic", id: "claude" });
    expect(generationInput.prompt).toContain("Return only one JSON object");
    expect(generationInput.prompt).toContain('"required":["summary","tags"]');
    expect(result.data.info.structured_output).toEqual({
      summary: "done",
      tags: ["v2"],
    });
    expect((await client.session.delete({ sessionID })).data).toBe(true);
  });

  it("maps V1 noReply prompts to V2 synthetic messages", async () => {
    let syntheticInput: any;
    const ctx = createContext({
      session: {
        ...createContext().session,
        synthetic: async (input: any) => {
          syntheticInput = input;
          return input;
        },
      },
    });
    const client = createLegacyClient(ctx);
    await client.session.prompt({
      path: { id: "ses-1" },
      body: {
        noReply: true,
        parts: [{ type: "text", text: "restored memory", metadata: { source: "memory" } }],
      },
    });

    expect(syntheticInput).toEqual({
      sessionID: "ses-1",
      text: "restored memory",
      description: "memory context",
      metadata: { source: "memory" },
    });
  });

  it("maps released V2 compaction events to the V1 handler name", () => {
    expect(
      toLegacyEvent({
        type: "session.compaction.ended",
        data: { sessionID: "ses-1" },
      })
    ).toEqual({
      type: "session.compacted",
      properties: { sessionID: "ses-1" },
    });
  });

  it("maps V2 execution.succeeded to session.idle for auto-capture", () => {
    expect(
      toLegacyEvent({
        type: "session.execution.succeeded",
        data: { sessionID: "ses-1" },
      })
    ).toEqual({
      type: "session.idle",
      properties: { sessionID: "ses-1" },
    });
  });

  it("filters the global event stream by direct or session location", async () => {
    const ctx = createContext();
    expect(
      await eventBelongsToLocation(ctx, {
        location: { directory: "/workspace/project" },
        data: { sessionID: "ses-1" },
      })
    ).toBe(true);
    expect(
      await eventBelongsToLocation(ctx, {
        location: { directory: "/workspace/other" },
        data: { sessionID: "ses-1" },
      })
    ).toBe(false);
    expect(
      await eventBelongsToLocation(ctx, {
        data: { sessionID: "ses-1" },
      })
    ).toBe(true);
  });

  it("forwards process-scoped provider/model inventory events without location", async () => {
    const ctx = createContext();
    expect(await eventBelongsToLocation(ctx, { type: "provider.updated", data: {} })).toBe(true);
    expect(await eventBelongsToLocation(ctx, { type: "model.updated", data: {} })).toBe(true);
    expect(
      await eventBelongsToLocation(ctx, {
        payload: { type: "provider.updated", data: {} },
      })
    ).toBe(true);
    // Still location-scoped when the host does attach a directory.
    expect(
      await eventBelongsToLocation(ctx, {
        type: "provider.updated",
        location: { directory: "/workspace/other" },
        data: {},
      })
    ).toBe(false);
    // Unrelated events without location/session stay filtered out.
    expect(await eventBelongsToLocation(ctx, { type: "session.idle", data: {} })).toBe(false);
  });

  it("normalizes legacy tool results", () => {
    expect(legacyToolResult("ok")).toEqual({ content: "ok" });
    expect(legacyToolResult({ output: "done", metadata: { count: 1 } })).toEqual({
      content: "done",
      metadata: { count: 1 },
    });
  });
});
