import { describe, expect, test } from "bun:test";

import { runCommand } from "./command.ts";

describe("command runner", () => {
  test("does not spawn a command when the signal is already aborted", async () => {
    const cancellation = new AbortController();
    cancellation.abort();

    const result = await runCommand("/definitely/not/a/real/command", [], {
      signal: cancellation.signal,
    });

    expect(result).toEqual({
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      outputExceeded: false,
      aborted: true,
    });
  });

  test("owns stdin EPIPE when a child exits without reading input", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.exit(0)"],
      {
        input: "x".repeat(1024 * 1024),
        timeoutMs: 5_000,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.aborted).toBe(false);
  });

  test("kills the active child when the caller aborts", async () => {
    const cancellation = new AbortController();
    const resultPromise = runCommand(
      process.execPath,
      ["-e", "setInterval(() => {}, 60_000)"],
      {
        signal: cancellation.signal,
        timeoutMs: 5_000,
      },
    );

    cancellation.abort();
    const result = await resultPromise;

    expect(result.aborted).toBe(true);
    expect(result.timedOut).toBe(false);
  });
});
