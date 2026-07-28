import { spawn } from "node:child_process";

export type CommandResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputExceeded: boolean;
  aborted: boolean;
};

export type RunCommandOptions = {
  input?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options?: RunCommandOptions,
) => Promise<CommandResult>;

export function commandFailureReason(result: CommandResult): string {
  if (result.aborted) return "cancelled";
  if (result.timedOut) return "timed out";
  if (result.outputExceeded) return "returned too much output";
  const detail = result.stderr.trim();
  return detail || `exited with status ${result.exitCode ?? "unknown"}`;
}

export const runCommand: CommandRunner = async (
  command,
  args,
  options = {},
) => {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024;

  if (options.signal?.aborted) {
    return {
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      outputExceeded: false,
      aborted: true,
    };
  }

  return await new Promise<CommandResult>((resolveResult, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let aborted = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const removeAbortListener = () => {
      options.signal?.removeEventListener("abort", abort);
    };

    const finish = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      removeAbortListener();
      resolveResult(result);
    };

    const abort = () => {
      aborted = true;
      child.kill("SIGKILL");
    };

    const append = (target: Buffer[], chunk: Buffer, stream: "stdout" | "stderr") => {
      if (stream === "stdout") {
        stdoutBytes += chunk.byteLength;
      } else {
        stderrBytes += chunk.byteLength;
      }
      if (stdoutBytes + stderrBytes > maxOutputBytes) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      target.push(chunk);
    };

    child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk, "stderr"));
    // A process that exits before consuming stdin can produce EPIPE. Its close
    // event remains the authoritative command result; owning this listener
    // prevents Bun from reporting the stream error as an unhandled exception.
    child.stdin.on("error", () => {});
    child.once("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      removeAbortListener();
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once("close", (exitCode, signal) => {
      finish({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
        outputExceeded,
        aborted,
      });
    });

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    timer.unref();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
    }

    if (options.input === undefined) {
      child.stdin.end();
    } else {
      child.stdin.end(options.input);
    }
  });
};
