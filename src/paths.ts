import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { PLUGIN_ID } from "./constants.ts";
import { isJsonObject } from "./json-file.ts";

export function presenterExecutablePath(): string {
  return realpathIfPresent(resolve(import.meta.dir, "..", "bin", "herdr-plannotator-present"));
}

export function plannotatorDataDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const configured = env.PLANNOTATOR_DATA_DIR?.trim();
  if (configured) {
    const expanded = expandHome(configured, home);
    if (isAbsolute(expanded)) {
      return resolve(expanded);
    }
    const focusedPaneCwd = focusedPaneCwdFromPluginContext(env);
    if (!focusedPaneCwd) {
      throw new Error(
        "relative PLANNOTATOR_DATA_DIR requires an absolute focused_pane_cwd "
        + "in HERDR_PLUGIN_CONTEXT_JSON; use an absolute or ~/... path instead",
      );
    }
    return resolve(focusedPaneCwd, configured);
  }

  const legacy = join(home, ".plannotator");
  if (existsSync(legacy)) {
    return legacy;
  }

  const xdgDataHome = env.XDG_DATA_HOME?.trim();
  if (xdgDataHome && isAbsolute(xdgDataHome)) {
    return join(xdgDataHome, "plannotator");
  }

  return legacy;
}

export function plannotatorConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  return join(plannotatorDataDir(env, home), "config.json");
}

export function integrationConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const explicitFile = env.HERDR_PLANNOTATOR_CONFIG?.trim();
  if (explicitFile) {
    return resolve(expandHome(explicitFile, home));
  }

  const explicitDir = env.HERDR_PLUGIN_CONFIG_DIR?.trim()
    || env.HERDR_PLANNOTATOR_CONFIG_DIR?.trim();
  if (explicitDir) {
    return join(resolve(expandHome(explicitDir, home)), "integration.json");
  }

  const configHome = env.XDG_CONFIG_HOME?.trim();
  const base = configHome && isAbsolute(configHome)
    ? configHome
    : join(home, ".config");
  const releasePath = join(base, "herdr", "plugins", "config", PLUGIN_ID, "integration.json");
  const debugPath = join(base, "herdr-dev", "plugins", "config", PLUGIN_ID, "integration.json");
  const socketPath = env.HERDR_SOCKET_PATH?.trim();
  const socketParts = socketPath?.split(/[\\/]/) ?? [];

  if (socketParts.includes("herdr-dev") && existsSync(debugPath)) {
    return debugPath;
  }
  if (socketParts.includes("herdr") && existsSync(releasePath)) {
    return releasePath;
  }
  if (existsSync(releasePath)) {
    return releasePath;
  }
  if (existsSync(debugPath)) {
    return debugPath;
  }
  return releasePath;
}

function expandHome(value: string, home: string): string {
  if (value === "~") {
    return home;
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(home, value.slice(2));
  }
  return value;
}

function focusedPaneCwdFromPluginContext(
  env: NodeJS.ProcessEnv,
): string | null {
  const raw = env.HERDR_PLUGIN_CONTEXT_JSON?.trim();
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isJsonObject(parsed)) {
    return null;
  }
  const cwd = parsed.focused_pane_cwd;
  if (typeof cwd !== "string") {
    return null;
  }
  const trimmed = cwd.trim();
  return trimmed && isAbsolute(trimmed) ? trimmed : null;
}

function realpathIfPresent(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
