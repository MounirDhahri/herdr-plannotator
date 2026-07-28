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

describe("Browser pane", () => {
  test("opens the supplied URL beside the source pane", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (command, args, options) => {
      expect(command).toBe("/bin/herdr");
      calls.push(args);
      expect(options?.signal).toBeDefined();
      if (args[0] === "pane") {
        return success();
      }
      return success(JSON.stringify({
        result: {
          type: "plugin_pane_opened",
          plugin_pane: {
            pane: { pane_id: "w1:p2" },
          },
        },
      }));
    };

    await expect(openBrowserPane(
      "/bin/herdr",
      "http://127.0.0.1:43127",
      "w1:p1",
      {
        runner,
        signal: new AbortController().signal,
      },
    )).resolves.toEqual({ paneId: "w1:p2" });
    expect(calls).toEqual([
      [
        "plugin",
        "pane",
        "open",
        "--plugin",
        "official.browser",
        "--entrypoint",
        "browser",
        "--placement",
        "zoomed",
        "--target-pane",
        "w1:p1",
        "--env",
        "HERDR_BROWSER_INITIAL_URL=http://127.0.0.1:43127",
        "--focus",
      ],
      [
        "pane",
        "wait-output",
        "w1:p2",
        "--match",
        "http://127.0.0.1:43127",
        "--source",
        "visible",
        "--timeout",
        "15000",
      ],
    ]);
  });

  test("closes the pane when Browser does not start", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (_command, args) => {
      calls.push(args);
      if (args[0] === "plugin" && args[2] === "open") {
        return success(JSON.stringify({
          result: {
            type: "plugin_pane_opened",
            plugin_pane: {
              pane: { pane_id: "w1:p2" },
            },
          },
        }));
      }
      if (args[0] === "pane" && args[1] === "wait-output") {
        return { ...success(), exitCode: 1, stderr: "Browser exited" };
      }
      return success();
    };

    await expect(openBrowserPane(
      "/bin/herdr",
      "http://127.0.0.1:43127",
      "w1:p1",
      { runner },
    )).rejects.toThrow("Failed to start Browser: Browser exited");
    expect(calls.at(-1)).toEqual([
      "plugin",
      "pane",
      "close",
      "w1:p2",
    ]);
  });

  test("closing an already-removed plugin pane is idempotent", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (_command, args) => {
      calls.push(args);
      return {
        ...success(),
        exitCode: 1,
        stderr: JSON.stringify({
          error: {
            code: args[0] === "plugin"
              ? "plugin_pane_not_found"
              : "pane_not_found",
          },
        }),
      };
    };

    await expect(closeBrowserPane(
      "/bin/herdr",
      { paneId: "w1:p2" },
      { runner },
    )).resolves.toBeUndefined();
    expect(calls).toEqual([
      ["plugin", "pane", "close", "w1:p2"],
      ["pane", "close", "w1:p2"],
    ]);
  });
});
