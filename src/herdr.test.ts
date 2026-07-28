import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoverBrowserPlugin,
  herdrVersionSupported,
  resolveRuntime,
  type ResolveRuntimeOptions,
} from "./herdr.ts";
import type { CommandRunner } from "./command.ts";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("Herdr discovery", () => {
  test("compares semantic versions numerically", () => {
    expect(herdrVersionSupported("0.7.5")).toBe(true);
    expect(herdrVersionSupported("0.8.0")).toBe(true);
    expect(herdrVersionSupported("0.7.4")).toBe(false);
    expect(herdrVersionSupported("0.10.0")).toBe(true);
  });

  test("requires an enabled official Browser plugin", async () => {
    const runner: CommandRunner = async () => ({
      exitCode: 0,
      signal: null,
      stdout: JSON.stringify({
        id: "cli:plugin",
        result: {
          type: "plugin_list",
          plugins: [{
            plugin_id: "official.browser",
            plugin_root: "/plugins/browser",
            enabled: true,
          }],
        },
      }),
      stderr: "",
      timedOut: false,
      outputExceeded: false,
      aborted: false,
    });

    await expect(discoverBrowserPlugin("/bin/herdr", runner)).resolves.toBe(
      "/plugins/browser",
    );
  });

  test("requires Browser support for an initial pane URL", async () => {
    const root = mkdtempSync(join(tmpdir(), "herdr-plannotator-browser-"));
    temporaryPaths.push(root);
    const browserRoot = join(root, "browser");
    const browserSource = join(browserRoot, "src");
    const herdrBin = join(root, "herdr");
    mkdirSync(browserSource, { recursive: true });
    writeFileSync(
      join(browserRoot, "herdr-plugin.toml"),
      'id = "official.browser"\n',
    );
    writeFileSync(join(browserSource, "viewer.ts"), "export {};\n");
    writeFileSync(herdrBin, "#!/bin/sh\n");
    chmodSync(herdrBin, 0o755);

    const runner: CommandRunner = async (_command, args) => ({
      exitCode: 0,
      signal: null,
      stdout: args[0] === "--version"
        ? "herdr 0.7.5\n"
        : JSON.stringify({
          result: {
            plugins: [{
              plugin_id: "official.browser",
              plugin_root: browserRoot,
              enabled: true,
            }],
          },
        }),
      stderr: "",
      timedOut: false,
      outputExceeded: false,
      aborted: false,
    });

    const options = {
      env: {
        HERDR_PLANNOTATOR_HERDR_BIN: herdrBin,
      },
      runner,
      cached: {
        schema: 2,
        owner: "official.plannotator",
        herdrBin,
        configuredAt: "2026-07-27T00:00:00.000Z",
      },
    } satisfies ResolveRuntimeOptions;

    await expect(resolveRuntime(options)).rejects.toThrow(
      "reinstall it to add HERDR_BROWSER_INITIAL_URL",
    );
    writeFileSync(
      join(browserSource, "viewer.ts"),
      'const initialUrl = process.env.HERDR_BROWSER_INITIAL_URL;\n',
    );
    const runtime = await resolveRuntime(options);
    expect(runtime.browserRoot).toBe(realpathSync(browserRoot));
  });
});
