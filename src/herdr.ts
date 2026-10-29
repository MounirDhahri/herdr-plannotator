import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import {
  HERDR_VERSION_TIMEOUT_MS,
  MIN_HERDR_VERSION,
  TERMINAL_BROWSER_BIN,
  TERMINAL_BROWSER_VERSION_TIMEOUT_MS,
} from "./constants.ts";
import type { CommandRunner } from "./command.ts";
import { commandFailureReason, runCommand } from "./command.ts";
import type { IntegrationConfig } from "./integration-config.ts";
import {
  readIntegrationConfig,
  usableExecutable,
} from "./integration-config.ts";
import { integrationConfigPath } from "./paths.ts";

export type ResolvedHerdrRuntime = {
  herdrBin: string;
  herdrVersion: string;
};

export type ResolvedRuntime = ResolvedHerdrRuntime & {
  terminalBrowserBin: string;
  terminalBrowserVersion: string;
};

export type ResolveRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
  cached?: IntegrationConfig | null;
  signal?: AbortSignal;
};

export async function resolveRuntime(
  options: ResolveRuntimeOptions = {},
): Promise<ResolvedRuntime> {
  const env = options.env ?? process.env;
  const runner = options.runner ?? runCommand;
  const [herdrBin, terminalBrowserBin] = await Promise.all([
    resolveHerdrExecutable(options),
    resolveTerminalBrowserExecutable(env),
  ]);
  const [herdrVersion, terminalBrowserVersion] = await Promise.all([
    readHerdrVersion(herdrBin, runner, env, options.signal),
    readTerminalBrowserVersion(terminalBrowserBin, runner, env, options.signal),
  ]);

  return {
    herdrBin,
    herdrVersion,
    terminalBrowserBin,
    terminalBrowserVersion,
  };
}

export async function resolveHerdrExecutable(
  options: ResolveRuntimeOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const cached = options.cached === undefined
    ? await readIntegrationConfig(integrationConfigPath(env)).catch(() => null)
    : options.cached;
  const herdrBin = await resolveExecutableCandidates(
    [
      env.HERDR_PLANNOTATOR_HERDR_BIN,
      env.HERDR_BIN_PATH,
      cached?.herdrBin,
      "herdr",
    ],
    env,
  );
  if (!herdrBin) {
    throw new Error("Herdr executable was not found");
  }
  return herdrBin;
}

export async function readHerdrVersion(
  herdrBin: string,
  runner: CommandRunner = runCommand,
  env: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal,
): Promise<string> {
  const result = await runner(herdrBin, ["--version"], {
    env,
    timeoutMs: HERDR_VERSION_TIMEOUT_MS,
    signal,
  });
  if (
    result.exitCode !== 0
    || result.timedOut
    || result.outputExceeded
    || result.aborted
  ) {
    throw new Error(`failed to read Herdr version: ${commandFailureReason(result)}`);
  }
  const match = result.stdout.match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/);
  if (!match) {
    throw new Error(`unrecognized Herdr version output: ${result.stdout.trim()}`);
  }
  return match[1];
}

export function herdrVersionSupported(
  version: string,
  minimum = MIN_HERDR_VERSION,
): boolean {
  const actual = parseSemver(version);
  const required = parseSemver(minimum);
  if (!actual || !required) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) {
      return actual[index] > required[index];
    }
  }
  return true;
}

export async function resolveTerminalBrowserExecutable(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const terminalBrowserBin = await resolveExecutableCandidates(
    [
      env.HERDR_PLANNOTATOR_TERMINAL_BROWSER_BIN,
      TERMINAL_BROWSER_BIN,
      // Herdr actions may run without the user's shell PATH; this is the
      // installer's default location.
      join(env.HOME?.trim() || homedir(), ".local", "bin", TERMINAL_BROWSER_BIN),
    ],
    env,
  );
  if (!terminalBrowserBin) {
    throw new Error(
      `${TERMINAL_BROWSER_BIN} executable was not found; install it from https://terminal-browser.com`,
    );
  }
  return terminalBrowserBin;
}

export async function readTerminalBrowserVersion(
  terminalBrowserBin: string,
  runner: CommandRunner = runCommand,
  env: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal,
): Promise<string> {
  const result = await runner(terminalBrowserBin, ["--version"], {
    env,
    timeoutMs: TERMINAL_BROWSER_VERSION_TIMEOUT_MS,
    signal,
  });
  if (
    result.exitCode !== 0
    || result.timedOut
    || result.outputExceeded
    || result.aborted
  ) {
    throw new Error(
      `failed to read ${TERMINAL_BROWSER_BIN} version: ${commandFailureReason(result)}`,
    );
  }
  return result.stdout.trim();
}

export async function resolveExecutableCandidates(
  candidates: Array<string | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) {
      continue;
    }
    if (isAbsolute(trimmed)) {
      const executable = await usableExecutable(trimmed);
      if (executable) {
        return executable;
      }
      continue;
    }
    if (trimmed.includes("/") || trimmed.includes("\\")) {
      continue;
    }
    const executable = await findOnPath(trimmed, env);
    if (executable) {
      return executable;
    }
  }
  return null;
}

async function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  for (const component of (env.PATH ?? "").split(delimiter)) {
    if (!component) {
      continue;
    }
    const executable = await usableExecutable(resolve(component, name));
    if (executable) {
      return executable;
    }
  }
  return null;
}

function parseSemver(version: string): [number, number, number] | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  ];
}
