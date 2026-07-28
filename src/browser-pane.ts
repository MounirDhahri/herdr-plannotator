import {
  BROWSER_INITIAL_URL_ENV,
  BROWSER_PANE_COMMAND_TIMEOUT_MS,
  BROWSER_PLUGIN_ID,
  BROWSER_READY_MATCH_TIMEOUT_MS,
  BROWSER_READY_TIMEOUT_MS,
} from "./constants.ts";
import type { CommandResult, CommandRunner } from "./command.ts";
import { commandFailureReason, runCommand } from "./command.ts";
import { isJsonObject } from "./json-file.ts";
import type { PresentationHandle } from "./presenter-protocol.ts";

export type BrowserPaneHandle = PresentationHandle;

type BrowserPaneOptions = {
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

export async function openBrowserPane(
  herdrBin: string,
  url: string,
  targetPaneId: string,
  options: BrowserPaneOptions = {},
): Promise<BrowserPaneHandle> {
  const runner = options.runner ?? runCommand;
  const result = await runner(
    herdrBin,
    [
      "plugin",
      "pane",
      "open",
      "--plugin",
      BROWSER_PLUGIN_ID,
      "--entrypoint",
      "browser",
      "--placement",
      "zoomed",
      "--target-pane",
      targetPaneId,
      "--env",
      `${BROWSER_INITIAL_URL_ENV}=${url}`,
      "--focus",
    ],
    {
      env: options.env,
      timeoutMs: BROWSER_PANE_COMMAND_TIMEOUT_MS,
      signal: options.signal,
    },
  );
  if (result.exitCode !== 0) {
    throw commandError(
      result,
      "browser_pane_open_failed",
      "open Browser pane",
    );
  }

  const paneId = openedPaneId(result.stdout);
  if (!paneId) {
    throw new BrowserPaneError(
      "browser_pane_open_failed",
      "Herdr did not return the opened Browser pane ID",
    );
  }
  const handle = { paneId };
  const ready = await runner(
    herdrBin,
    [
      "pane",
      "wait-output",
      paneId,
      "--match",
      new URL(url).origin,
      "--source",
      "visible",
      "--timeout",
      String(BROWSER_READY_MATCH_TIMEOUT_MS),
    ],
    {
      env: options.env,
      timeoutMs: BROWSER_READY_TIMEOUT_MS,
      signal: options.signal,
    },
  );
  if (ready.exitCode === 0) {
    return handle;
  }

  await closeBrowserPane(herdrBin, handle, {
    runner,
    env: options.env,
  }).catch(() => {});
  throw commandError(
    ready,
    "browser_pane_start_failed",
    "start Browser",
  );
}

export async function closeBrowserPane(
  herdrBin: string,
  handle: BrowserPaneHandle,
  options: BrowserPaneOptions = {},
): Promise<void> {
  const runner = options.runner ?? runCommand;
  const commandOptions = {
    env: options.env,
    timeoutMs: BROWSER_PANE_COMMAND_TIMEOUT_MS,
    signal: options.signal,
  };
  const pluginClose = await runner(
    herdrBin,
    ["plugin", "pane", "close", handle.paneId],
    commandOptions,
  );
  if (pluginClose.exitCode === 0) {
    return;
  }
  if (!isMissingPane(pluginClose)) {
    throw commandError(
      pluginClose,
      "browser_pane_close_failed",
      "close Browser pane",
    );
  }

  const paneClose = await runner(
    herdrBin,
    ["pane", "close", handle.paneId],
    commandOptions,
  );
  if (paneClose.exitCode === 0 || isMissingPane(paneClose)) {
    return;
  }
  throw commandError(
    paneClose,
    "browser_pane_close_failed",
    "close Browser pane",
  );
}

export class BrowserPaneError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BrowserPaneError";
  }
}

function commandError(
  result: CommandResult,
  code: string,
  action: string,
): BrowserPaneError {
  return new BrowserPaneError(
    code,
    `Failed to ${action}: ${commandFailureReason(result)}`,
  );
}

function openedPaneId(output: string): string | null {
  const response = parseRecord(output);
  const result = isJsonObject(response?.result) ? response.result : null;
  const pluginPane = isJsonObject(result?.plugin_pane)
    ? result.plugin_pane
    : null;
  const pane = isJsonObject(pluginPane?.pane) ? pluginPane.pane : null;
  return result?.type === "plugin_pane_opened"
    && typeof pane?.pane_id === "string"
    && pane.pane_id.trim()
    ? pane.pane_id.trim()
    : null;
}

function isMissingPane(result: CommandResult): boolean {
  const response = parseRecord(result.stderr) ?? parseRecord(result.stdout);
  const error = isJsonObject(response?.error) ? response.error : null;
  return error?.code === "plugin_pane_not_found"
    || error?.code === "pane_not_found";
}

function parseRecord(output: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(output.trim());
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}
