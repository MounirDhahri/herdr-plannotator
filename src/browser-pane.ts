import {
  BROWSER_OPEN_TIMEOUT_MS,
  BROWSER_PANE_COMMAND_TIMEOUT_MS,
  TERMINAL_BROWSER_BIN,
} from "./constants.ts";
import type { CommandResult, CommandRunner } from "./command.ts";
import { commandFailureReason, runCommand } from "./command.ts";
import { isJsonObject } from "./json-file.ts";
import type { PresentationHandle } from "./presenter-protocol.ts";

export type BrowserPaneHandle = PresentationHandle;

export type BrowserPaneExecutables = {
  herdrBin: string;
  terminalBrowserBin: string;
};

type BrowserPaneOptions = {
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

// terminal-browser splits the pane named by HERDR_PANE_ID in the supplied
// environment and returns once the browser is running.
export async function openBrowserPane(
  executables: BrowserPaneExecutables,
  url: string,
  options: BrowserPaneOptions = {},
): Promise<BrowserPaneHandle> {
  const runner = options.runner ?? runCommand;
  const opened = await runner(
    executables.terminalBrowserBin,
    ["open", url, "--split", "right", "--no-merge"],
    {
      env: options.env,
      timeoutMs: BROWSER_OPEN_TIMEOUT_MS,
      signal: options.signal,
    },
  );
  if (opened.exitCode !== 0) {
    throw commandError(opened, "browser_pane_open_failed", `open ${TERMINAL_BROWSER_BIN}`);
  }
  const browserKey = opened.stdout.match(/^opened (\S+)/m)?.[1];
  if (!browserKey) {
    throw new BrowserPaneError(
      "browser_pane_open_failed",
      `${TERMINAL_BROWSER_BIN} did not report the opened browser`,
    );
  }

  const listed = await runner(
    executables.terminalBrowserBin,
    ["ls", "--json"],
    {
      env: options.env,
      timeoutMs: BROWSER_PANE_COMMAND_TIMEOUT_MS,
      signal: options.signal,
    },
  );
  if (listed.exitCode !== 0) {
    throw commandError(listed, "browser_pane_open_failed", `list ${TERMINAL_BROWSER_BIN} browsers`);
  }
  const paneId = browserPaneId(listed.stdout, browserKey);
  if (!paneId) {
    throw new BrowserPaneError(
      "browser_pane_open_failed",
      `${TERMINAL_BROWSER_BIN} did not report a Herdr pane for browser ${browserKey}`,
    );
  }

  // A failed zoom still leaves a usable split, so it does not fail the review.
  await runner(
    executables.herdrBin,
    ["pane", "zoom", paneId, "--on"],
    {
      env: options.env,
      timeoutMs: BROWSER_PANE_COMMAND_TIMEOUT_MS,
      signal: options.signal,
    },
  ).catch(() => {});
  return { paneId };
}

export async function closeBrowserPane(
  herdrBin: string,
  handle: BrowserPaneHandle,
  options: BrowserPaneOptions = {},
): Promise<void> {
  const runner = options.runner ?? runCommand;
  const result = await runner(
    herdrBin,
    ["pane", "close", handle.paneId],
    {
      env: options.env,
      timeoutMs: BROWSER_PANE_COMMAND_TIMEOUT_MS,
      signal: options.signal,
    },
  );
  if (result.exitCode === 0 || isMissingPane(result)) {
    return;
  }
  throw commandError(
    result,
    "browser_pane_close_failed",
    "close browser pane",
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

function browserPaneId(output: string, browserKey: string): string | null {
  const listing = parseRecord(output);
  const browsers = Array.isArray(listing?.browsers) ? listing.browsers : [];
  const browser = browsers.find((candidate) => (
    isJsonObject(candidate) && candidate.key === browserKey
  ));
  const pane = isJsonObject(browser) && isJsonObject(browser.pane)
    ? browser.pane
    : null;
  return typeof pane?.pane === "string" && pane.pane.trim()
    ? pane.pane.trim()
    : null;
}

function isMissingPane(result: CommandResult): boolean {
  const response = parseRecord(result.stderr) ?? parseRecord(result.stdout);
  const error = isJsonObject(response?.error) ? response.error : null;
  return error?.code === "pane_not_found";
}

function parseRecord(output: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(output.trim());
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}
