import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  herdrVersionSupported,
  resolveRuntime,
  resolveTerminalBrowserExecutable,
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

  test("resolves terminal-browser alongside Herdr", async () => {
    const root = mkdtempSync(join(tmpdir(), "herdr-plannotator-runtime-"));
    temporaryPaths.push(root);
    const herdrBin = join(root, "herdr");
    const terminalBrowserBin = join(root, "terminal-browser");
    for (const executable of [herdrBin, terminalBrowserBin]) {
      writeFileSync(executable, "#!/bin/sh\n");
      chmodSync(executable, 0o755);
    }

    const runner: CommandRunner = async (command) => ({
      exitCode: 0,
      signal: null,
      stdout: command === realpathSync(herdrBin)
        ? "herdr 0.7.5\n"
        : "terminal-browser v0.15.1\n",
      stderr: "",
      timedOut: false,
      outputExceeded: false,
      aborted: false,
    });

    const runtime = await resolveRuntime({
      env: {
        HERDR_PLANNOTATOR_HERDR_BIN: herdrBin,
        HERDR_PLANNOTATOR_TERMINAL_BROWSER_BIN: terminalBrowserBin,
      },
      runner,
      cached: null,
    } satisfies ResolveRuntimeOptions);
    expect(runtime).toEqual({
      herdrBin: realpathSync(herdrBin),
      herdrVersion: "0.7.5",
      terminalBrowserBin: realpathSync(terminalBrowserBin),
      terminalBrowserVersion: "terminal-browser v0.15.1",
    });
  });

  test("reports a missing terminal-browser", async () => {
    await expect(resolveTerminalBrowserExecutable({
      HOME: "/nonexistent",
      PATH: "",
    })).rejects.toThrow("terminal-browser executable was not found");
  });
});
