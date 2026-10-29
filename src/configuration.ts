import {
  INTEGRATION_CONFIG_SCHEMA,
  MIN_HERDR_VERSION,
  PLUGIN_ID,
} from "./constants.ts";
import {
  type IntegrationConfig,
  usableExecutable,
  writeIntegrationConfig,
} from "./integration-config.ts";
import {
  herdrVersionSupported,
  resolveRuntime,
  type ResolvedRuntime,
} from "./herdr.ts";
import {
  configMatchesPresenter,
  configurePlannotator,
} from "./plannotator-config.ts";
import {
  integrationConfigPath,
  plannotatorConfigPath,
  presenterExecutablePath,
} from "./paths.ts";
import {
  readOptionalJson,
  requireJsonObject,
} from "./json-file.ts";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export async function configureIntegration(): Promise<{
  runtime: ResolvedRuntime;
  presenterCommand: string;
  plannotatorConfig: string;
  integrationConfig: string;
}> {
  const presenterCommand = presenterExecutablePath();
  if (!await usableExecutable(presenterCommand)) {
    throw new Error(`presenter executable is missing or not executable: ${presenterCommand}`);
  }

  const runtime = await resolveRuntime();
  if (!herdrVersionSupported(runtime.herdrVersion)) {
    throw new Error(
      `Herdr ${MIN_HERDR_VERSION} or newer is required; found ${runtime.herdrVersion}`,
    );
  }

  const configuredAt = new Date().toISOString();
  const integration: IntegrationConfig = {
    schema: INTEGRATION_CONFIG_SCHEMA,
    owner: PLUGIN_ID,
    herdrBin: runtime.herdrBin,
    configuredAt,
  };
  const integrationPath = integrationConfigPath();
  const configPath = plannotatorConfigPath();
  await writeIntegrationConfig(integration, integrationPath);
  await configurePlannotator(presenterCommand, configPath, configuredAt);

  return {
    runtime,
    presenterCommand,
    plannotatorConfig: configPath,
    integrationConfig: integrationPath,
  };
}

export async function runDoctorChecks(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  let runtime: ResolvedRuntime | null = null;
  try {
    runtime = await resolveRuntime();
    checks.push({
      name: "Herdr",
      ok: herdrVersionSupported(runtime.herdrVersion),
      detail: herdrVersionSupported(runtime.herdrVersion)
        ? `${runtime.herdrVersion} at ${runtime.herdrBin}`
        : `${runtime.herdrVersion}; ${MIN_HERDR_VERSION} or newer is required`,
    });
    checks.push({
      name: "Terminal Browser",
      ok: true,
      detail: `${runtime.terminalBrowserVersion} at ${runtime.terminalBrowserBin}`,
    });
  } catch (error) {
    checks.push({
      name: "Runtime discovery",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const command = presenterExecutablePath();
  const environmentCheck = presenterEnvironmentCheck(command);
  if (environmentCheck) {
    checks.push(environmentCheck);
  }
  try {
    const raw = await readOptionalJson(plannotatorConfigPath());
    const config = requireJsonObject(raw, plannotatorConfigPath());
    checks.push({
      name: "Plannotator config",
      ok: configMatchesPresenter(config, command),
      detail: configMatchesPresenter(config, command)
        ? command
        : `run the ${PLUGIN_ID}.configure action`,
    });
  } catch (error) {
    checks.push({
      name: "Plannotator config",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return checks;
}

/**
 * Reports whether Plannotator's environment-level presenter override agrees
 * with the managed helper. An absent override returns no additional check.
 */
export function presenterEnvironmentCheck(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): DoctorCheck | null {
  if (!Object.hasOwn(env, "PLANNOTATOR_PRESENTER")) {
    return null;
  }
  const override = env.PLANNOTATOR_PRESENTER?.trim() ?? "";
  if (!override) {
    return {
      name: "Presenter environment override",
      ok: false,
      detail: "PLANNOTATOR_PRESENTER is set but empty, which disables the configured presenter",
    };
  }
  if (override === command) {
    return {
      name: "Presenter environment override",
      ok: true,
      detail: `${command} (matches the managed presenter)`,
    };
  }
  return {
    name: "Presenter environment override",
    ok: false,
    detail: "PLANNOTATOR_PRESENTER overrides config.json; unset it or point it at the managed presenter",
  };
}
