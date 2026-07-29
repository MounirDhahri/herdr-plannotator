export const PLUGIN_ID = "official.plannotator";
export const BROWSER_PLUGIN_ID = "official.browser";
export const BROWSER_INITIAL_URL_ENV = "HERDR_BROWSER_INITIAL_URL";
export const PRESENTER_PROTOCOL = 1;
export const MIN_HERDR_VERSION = "0.7.5";
export const INTEGRATION_CONFIG_SCHEMA = 2;
export const OWNERSHIP_KEY = "_herdrPlannotator";
export const MAX_PROTOCOL_BYTES = 64 * 1024;
// Discovery, pane startup, readiness, and failed-startup cleanup must fit
// inside Plannotator's 15-second presentation deadline.
export const HERDR_VERSION_TIMEOUT_MS = 2_000;
export const BROWSER_DISCOVERY_TIMEOUT_MS = 2_000;
export const BROWSER_PANE_COMMAND_TIMEOUT_MS = 3_000;
export const BROWSER_READY_TIMEOUT_MS = 6_000;
export const BROWSER_READY_MATCH_TIMEOUT_MS = 5_000;
