import { readFile, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";

import {
  BROWSER_DISCOVERY_TIMEOUT_MS,
  BROWSER_INITIAL_URL_ENV,
  BROWSER_PLUGIN_ID,
  HERDR_VERSION_TIMEOUT_MS,
  MIN_HERDR_VERSION,
} from "./constants.ts";
import type { CommandRunner } from "./command.ts";
import { commandFailureReason, runCommand } from "./command.ts";
import type { IntegrationConfig } from "./integration-config.ts";
import {
  readIntegrationConfig,
  usableExecutable,
} from "./integration-config.ts";
import { isJsonObject } from "./json-file.ts";
import { integrationConfigPath } from "./paths.ts";

export type ResolvedHerdrRuntime = {
  herdrBin: string;
  herdrVersion: string;
};

export type ResolvedRuntime = ResolvedHerdrRuntime & {
  browserRoot: string;
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
  const herdrBin = await resolveHerdrExecutable(options);
  const [herdrVersion, browserRoot] = await Promise.all([
    readHerdrVersion(herdrBin, runner, env, options.signal),
    discoverBrowserPlugin(herdrBin, runner, env, options.signal)
      .then(validateBrowserRoot),
  ]);

  return {
    herdrBin,
    herdrVersion,
    browserRoot,
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

export async function discoverBrowserPlugin(
  herdrBin: string,
  runner: CommandRunner = runCommand,
  env: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal,
): Promise<string> {
  const result = await runner(
    herdrBin,
    ["plugin", "list", "--plugin", BROWSER_PLUGIN_ID, "--json"],
    {
      env,
      timeoutMs: BROWSER_DISCOVERY_TIMEOUT_MS,
      signal,
    },
  );
  if (
    result.exitCode !== 0
    || result.timedOut
    || result.outputExceeded
    || result.aborted
  ) {
    throw new Error(
      `failed to inspect ${BROWSER_PLUGIN_ID}: ${commandFailureReason(result)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Herdr returned malformed plugin JSON: ${result.stdout.trim()}`);
  }
  const plugins = isJsonObject(parsed)
    && isJsonObject(parsed.result)
    && Array.isArray(parsed.result.plugins)
    ? parsed.result.plugins
    : null;
  const plugin = plugins?.find((candidate) => (
    isJsonObject(candidate) && candidate.plugin_id === BROWSER_PLUGIN_ID
  ));
  if (!isJsonObject(plugin)) {
    throw new Error(
      `${BROWSER_PLUGIN_ID} is not installed; run: herdr plugin install ogulcancelik/herdr-browser --yes`,
    );
  }
  if (plugin.enabled !== true) {
    throw new Error(`${BROWSER_PLUGIN_ID} is installed but disabled`);
  }
  if (typeof plugin.plugin_root !== "string" || !isAbsolute(plugin.plugin_root)) {
    throw new Error(`${BROWSER_PLUGIN_ID} returned an invalid plugin root`);
  }
  return plugin.plugin_root;
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

async function validateBrowserRoot(rawRoot: string): Promise<string> {
  const root = await realpath(rawRoot);
  const manifest = join(root, "herdr-plugin.toml");
  const manifestText = await readFile(manifest, "utf8");
  if (!/^\s*id\s*=\s*["']official\.browser["']\s*$/m.test(manifestText)) {
    throw new Error(`${rawRoot} is not the ${BROWSER_PLUGIN_ID} plugin root`);
  }
  const viewer = await readFile(join(root, "src", "viewer.ts"), "utf8");
  // Browser kept version 0.1.0 when initial URL support was added, so inspect
  // the installed viewer for the capability instead of comparing versions.
  if (!viewer.includes(BROWSER_INITIAL_URL_ENV)) {
    throw new Error(
      `${BROWSER_PLUGIN_ID} is too old; reinstall it to add ${BROWSER_INITIAL_URL_ENV}`,
    );
  }
  return root;
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
