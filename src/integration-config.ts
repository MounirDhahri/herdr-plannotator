import { access, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import {
  INTEGRATION_CONFIG_SCHEMA,
  PLUGIN_ID,
} from "./constants.ts";
import { integrationConfigPath } from "./paths.ts";
import {
  isJsonObject,
  readOptionalJson,
  writeJsonAtomic,
} from "./json-file.ts";

export type IntegrationConfig = {
  schema: typeof INTEGRATION_CONFIG_SCHEMA;
  owner: typeof PLUGIN_ID;
  herdrBin: string;
  configuredAt: string;
};

export async function readIntegrationConfig(
  path = integrationConfigPath(),
): Promise<IntegrationConfig | null> {
  const raw = await readOptionalJson(path);
  return isIntegrationConfig(raw) ? raw : null;
}

export async function writeIntegrationConfig(
  config: IntegrationConfig,
  path = integrationConfigPath(),
): Promise<void> {
  await writeJsonAtomic(path, config);
}

export async function usableExecutable(path: string | undefined): Promise<string | null> {
  if (!path) {
    return null;
  }
  try {
    const resolved = await realpath(path);
    await access(resolved, fsConstants.X_OK);
    return resolved;
  } catch {
    return null;
  }
}

function isIntegrationConfig(value: unknown): value is IntegrationConfig {
  if (!isJsonObject(value)) {
    return false;
  }
  return (
    value.schema === INTEGRATION_CONFIG_SCHEMA
    && value.owner === PLUGIN_ID
    && typeof value.herdrBin === "string"
    && typeof value.configuredAt === "string"
  );
}
