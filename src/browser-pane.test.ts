import { describe, expect, test } from "bun:test";

import {
  closeBrowserPane,
  openBrowserPane,
} from "./browser-pane.ts";
import type { CommandResult, CommandRunner } from "./command.ts";

const success = (
  stdout = "",
): CommandResult => ({
  exitCode: 0,
  signal: null,
  stdout,
  stderr: "",
  timedOut: false,
  outputExceeded: false,
  aborted: false,
});

const executables = {
  herdrBin: "/bin/herdr",
  terminalBrowserBin: "/bin/terminal-browser",
};

const listing = JSON.stringify({
  self: { tab: "w1:t1", pane: "w1:p1" },
  browsers: [
    { key: "100-1", pane: { tab: "w1:t1", pane: "w1:p9" } },
    { key: "200-1", pane: { tab: "w1:t1", pane: "w1:p2" } },
  ],
});

describe("Browser pane", () => {
  test("opens the supplied URL in a zoomed split beside the source pane", async () => {
    const calls: Array<[string, string[]]> = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push([command, args]);
      expect(options?.signal).toBeDefined();
      if (args[0] === "open") {
        return success("opened 200-1 (terminal-browser ls for details)\n");
      }
      if (args[0] === "ls") {
        return success(listing);
      }
      return success();
    };

    await expect(openBrowserPane(
      executables,
      "http://127.0.0.1:43127",
      {
        runner,
        signal: new AbortController().signal,
      },
    )).resolves.toEqual({ paneId: "w1:p2" });
    expect(calls).toEqual([
      [
        "/bin/terminal-browser",
        ["open", "http://127.0.0.1:43127", "--split", "right", "--no-merge"],
      ],
      ["/bin/terminal-browser", ["ls", "--json"]],
      ["/bin/herdr", ["pane", "zoom", "w1:p2", "--on"]],
    ]);
  });

  test("fails when terminal-browser does not start", async () => {
    const runner: CommandRunner = async () => ({
      ...success(),
      exitCode: 1,
      stderr: "no terminal",
    });

    await expect(openBrowserPane(
      executables,
      "http://127.0.0.1:43127",
      { runner },
    )).rejects.toThrow("Failed to open terminal-browser: no terminal");
  });

  test("fails when the opened browser has no Herdr pane", async () => {
    const runner: CommandRunner = async (_command, args) => (
      args[0] === "open"
        ? success("opened 300-1 (terminal-browser ls for details)\n")
        : success(listing)
    );

    await expect(openBrowserPane(
      executables,
      "http://127.0.0.1:43127",
      { runner },
    )).rejects.toThrow("did not report a Herdr pane for browser 300-1");
  });

  test("keeps the pane when zoom fails", async () => {
    const runner: CommandRunner = async (_command, args) => {
      if (args[0] === "open") {
        return success("opened 200-1\n");
      }
      if (args[0] === "ls") {
        return success(listing);
      }
      return { ...success(), exitCode: 1, stderr: "zoom failed" };
    };

    await expect(openBrowserPane(
      executables,
      "http://127.0.0.1:43127",
      { runner },
    )).resolves.toEqual({ paneId: "w1:p2" });
  });

  test("closing an already-removed pane is idempotent", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (_command, args) => {
      calls.push(args);
      return {
        ...success(),
        exitCode: 1,
        stdout: JSON.stringify({
          error: { code: "pane_not_found" },
        }),
      };
    };

    await expect(closeBrowserPane(
      "/bin/herdr",
      { paneId: "w1:p2" },
      { runner },
    )).resolves.toBeUndefined();
    expect(calls).toEqual([["pane", "close", "w1:p2"]]);
  });
});
