import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLegacyClient } from "../src/v2/legacy-client.js";

/**
 * Typed-shape helpers mirroring the @opencode/client ProviderListOutput
 * contract used by the native v2 plugin context:
 *   ctx.provider.list() -> { location, data: ProviderInfo[] }
 *   ProviderInfo { id, canonical?, activation: auto|enabled|disabled, ... }
 */

interface FixtureProviderInfo {
  id: string;
  canonical?: string;
  name: string;
  activation: "auto" | "enabled" | "disabled";
  package: string;
  settings?: Record<string, unknown>;
}

function providerListOutput(providers: FixtureProviderInfo[]) {
  return {
    location: { directory: "/workspace/project" },
    data: providers,
  };
}

/** ctx.model.list that explodes if the bridge ever falls back to it. */
function explodingModelList(): () => Promise<never> {
  return async () => {
    throw new Error("model.list must not be called for provider connectivity");
  };
}

function createContext(options: {
  providers?: FixtureProviderInfo[];
  modelList?: () => Promise<unknown>;
  providerList?: () => Promise<unknown>;
}) {
  return {
    location: {
      directory: "/workspace/project",
      project: { id: "project", directory: "/workspace/project", canonical: "project" },
    },
    provider: {
      list: options.providerList ?? (async () => providerListOutput(options.providers ?? [])),
    },
    model: {
      list: options.modelList ?? explodingModelList(),
    },
    generate: {
      text: async () => ({ text: "{}" }),
    },
    session: {
      get: async () => ({ id: "ses", location: { directory: "/workspace/project" } }),
      context: async () => [],
      synthetic: async (input: unknown) => input,
      prompt: async (input: unknown) => input,
      interrupt: async () => ({ interrupted: true }),
    },
  } as any;
}

describe("v2 legacy client provider connectivity", () => {
  it("includes an enabled provider absent from model.list (the broker-directory bug)", async () => {
    // Reproduces the live failure: model.list reports only broker 'opencode'
    // models while the real provider directory has newapi activation=enabled.
    // The old implementation returned ['opencode'], so isProviderConnected(
    // 'newapi') was false and every capture exhausted its retries.
    const ctx = createContext({
      providers: [
        {
          id: "newapi",
          name: "NewAPI",
          activation: "enabled",
          package: "newapi-pkg",
        },
        {
          id: "opencode",
          name: "OpenCode",
          activation: "auto",
          package: "opencode-pkg",
        },
      ],
      modelList: async () => ({
        data: [{ providerID: "opencode", id: "glm-5.3-flash" }],
      }),
    });
    const client = createLegacyClient(ctx);
    const result = await client.provider.list();
    // Model list is consulted nowhere: model.list above does NOT throw, but
    // the default explodingModelList variant in the next test proves that.
    expect(result.data.connected).toEqual(["newapi", "opencode"]);
  });

  it("never falls back to model.list; auto passes, disabled is filtered, ids dedup", async () => {
    const ctx = createContext({
      providers: [
        { id: "auto-provider", name: "Auto", activation: "auto", package: "p1" },
        { id: "disabled-provider", name: "Off", activation: "disabled", package: "p2" },
        { id: "enabled-provider", name: "On", activation: "enabled", package: "p3" },
        // Duplicate id entries (directory can list a provider more than
        // once, e.g. config + auth file sources) must dedup to one entry.
        { id: "enabled-provider", name: "On (again)", activation: "enabled", package: "p3" },
      ],
      // model.list throws if called — the provider directory is the single
      // source of truth; a broker-directory world must not resurrect the
      // model-based fallback.
      modelList: explodingModelList(),
    });
    const client = createLegacyClient(ctx);
    const result = await client.provider.list();
    expect(result.data.connected).toEqual(["auto-provider", "enabled-provider"]);
  });

  it("returns an authoritative empty list when the directory is empty or all-disabled", async () => {
    // Empty directory and all-disabled directory must both stay empty; no
    // fallback to model.list (which throws here) even though models exist.
    const empty = await createLegacyClient(createContext({ providers: [] })).provider.list();
    expect(empty.data.connected).toEqual([]);

    const allDisabled = await createLegacyClient(
      createContext({
        providers: [
          { id: "off-a", name: "A", activation: "disabled", package: "pa" },
          { id: "off-b", name: "B", activation: "disabled", package: "pb" },
        ],
        modelList: explodingModelList(),
      })
    ).provider.list();
    expect(allDisabled.data.connected).toEqual([]);
  });

  it("propagates provider.list errors instead of faking an empty result", async () => {
    const ctx = createContext({
      providerList: async () => {
        throw new Error("provider directory unavailable");
      },
    });
    const client = createLegacyClient(ctx);
    // The init path catches and logs; the bridge itself must not swallow
    // the error and fabricate connected=[] (which reads as "no providers").
    await expect(client.provider.list()).rejects.toThrow("provider directory unavailable");
  });

  it("outputs only provider ids — no names, settings, or secrets", async () => {
    const ctx = createContext({
      providers: [
        {
          id: "enabled-provider",
          canonical: "some-canonical",
          name: "Display Name",
          activation: "enabled",
          package: "p3",
          settings: { apiKey: "sk-secret-value", baseURL: "https://internal" },
        },
      ],
    });
    const client = createLegacyClient(ctx);
    const result = await client.provider.list();
    expect(result.data.connected).toEqual(["enabled-provider"]);
    expect(JSON.stringify(result)).not.toContain("sk-secret-value");
    expect(JSON.stringify(result)).not.toContain("Display Name");
    expect(JSON.stringify(result)).not.toContain("canonical");
  });

  it("flows connected ids through setConnectedProviders → isProviderConnected (subprocess gate)", () => {
    const home = mkdtempSync(join(tmpdir(), "opencode-mem-v2-provider-gate-"));
    try {
      const child = Bun.spawnSync({
        cmd: [
          process.execPath,
          fileURLToPath(new URL("./fixtures/v2-provider-gate.mjs", import.meta.url)),
        ],
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_DATA_HOME: join(home, ".local", "share"),
          XDG_STATE_HOME: join(home, ".local", "state"),
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(child.exitCode).toBe(0);
      expect(child.stderr.toString()).toBe("");
      const output = JSON.parse(child.stdout.toString().trim()) as {
        connected: string[];
        enabledNewapi: boolean;
        autoOpencode: boolean;
        disabledLegacyOff: boolean;
        unknown: boolean;
      };
      expect(output.connected).toEqual(["newapi", "opencode"]);
      expect(output.enabledNewapi).toBe(true);
      expect(output.autoOpencode).toBe(true);
      expect(output.disabledLegacyOff).toBe(false);
      expect(output.unknown).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
