export const PLUGIN_ID = "official.plannotator";
export const TERMINAL_BROWSER_BIN = "terminal-browser";
export const PRESENTER_PROTOCOL = 1;
export const MIN_HERDR_VERSION = "0.7.5";
export const INTEGRATION_CONFIG_SCHEMA = 2;
export const OWNERSHIP_KEY = "_herdrPlannotator";
export const MAX_PROTOCOL_BYTES = 64 * 1024;
// Discovery, pane startup, readiness, and failed-startup cleanup must fit
// inside Plannotator's 15-second presentation deadline.
export const HERDR_VERSION_TIMEOUT_MS = 2_000;
export const TERMINAL_BROWSER_VERSION_TIMEOUT_MS = 2_000;
export const BROWSER_OPEN_TIMEOUT_MS = 6_000;
export const BROWSER_PANE_COMMAND_TIMEOUT_MS = 2_000;
