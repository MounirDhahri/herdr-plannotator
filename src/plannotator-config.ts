import { isDeepStrictEqual } from "node:util";

import {
  OWNERSHIP_KEY,
  PLUGIN_ID,
} from "./constants.ts";
import {
  isJsonObject,
  readOptionalJson,
  requireJsonObject,
  writeJsonAtomic,
} from "./json-file.ts";
import { plannotatorConfigPath } from "./paths.ts";

export type PresenterSetting = {
  command: string;
  when: "herdr";
};

type PreviousPresenter = {
  present: boolean;
  value?: unknown;
};

type OwnershipMetadata = {
  schema: 1;
  owner: typeof PLUGIN_ID;
  installedPresenter: PresenterSetting;
  previousPresenter: PreviousPresenter;
  configuredAt: string;
};

export type UnconfigureResult = {
  changed: boolean;
  presenterRestored: boolean;
  presenterPreserved: boolean;
};

export async function configurePlannotator(
  command: string,
  path = plannotatorConfigPath(),
  configuredAt = new Date().toISOString(),
): Promise<void> {
  const current = await readConfigObject(path);
  const configured = configureDocument(current, command, configuredAt);
  await writeJsonAtomic(path, configured);
}

export async function unconfigurePlannotator(
  path = plannotatorConfigPath(),
): Promise<UnconfigureResult> {
  const raw = await readOptionalJson(path);
  if (raw === undefined) {
    return {
      changed: false,
      presenterRestored: false,
      presenterPreserved: false,
    };
  }
  const current = requireJsonObject(raw, path);
  const result = unconfigureDocument(current);
  if (result.changed) {
    await writeJsonAtomic(path, result.document);
  }
  return {
    changed: result.changed,
    presenterRestored: result.presenterRestored,
    presenterPreserved: result.presenterPreserved,
  };
}

export function configureDocument(
  source: Record<string, unknown>,
  command: string,
  configuredAt: string,
): Record<string, unknown> {
  const document = { ...source };
  const installedPresenter: PresenterSetting = {
    command,
    when: "herdr",
  };
  const existingOwnership = parseOwnership(document[OWNERSHIP_KEY]);
  if (Object.hasOwn(document, OWNERSHIP_KEY) && !existingOwnership) {
    throw new Error(
      `refusing to overwrite unrecognized ${OWNERSHIP_KEY} metadata`,
    );
  }
  const currentPresenterPresent = Object.hasOwn(document, "presenter");
  const currentPresenter = document.presenter;
  const stillOwned = Boolean(
    existingOwnership
    && currentPresenterPresent
    && isDeepStrictEqual(
      currentPresenter,
      existingOwnership.installedPresenter,
    ),
  );
  const previousPresenter = stillOwned
    ? existingOwnership!.previousPresenter
    : {
      present: currentPresenterPresent,
      ...(currentPresenterPresent ? { value: currentPresenter } : {}),
    };

  const ownership: OwnershipMetadata = {
    schema: 1,
    owner: PLUGIN_ID,
    installedPresenter,
    previousPresenter,
    configuredAt,
  };
  document.presenter = installedPresenter;
  document[OWNERSHIP_KEY] = ownership;
  return document;
}

export function unconfigureDocument(
  source: Record<string, unknown>,
): {
  document: Record<string, unknown>;
  changed: boolean;
  presenterRestored: boolean;
  presenterPreserved: boolean;
} {
  const ownership = parseOwnership(source[OWNERSHIP_KEY]);
  if (!ownership) {
    return {
      document: source,
      changed: false,
      presenterRestored: false,
      presenterPreserved: false,
    };
  }

  const document = { ...source };
  const presenterStillOwned = (
    Object.hasOwn(document, "presenter")
    && isDeepStrictEqual(document.presenter, ownership.installedPresenter)
  );
  if (presenterStillOwned) {
    if (ownership.previousPresenter.present) {
      document.presenter = ownership.previousPresenter.value;
    } else {
      delete document.presenter;
    }
  }
  delete document[OWNERSHIP_KEY];
  return {
    document,
    changed: true,
    presenterRestored: presenterStillOwned,
    presenterPreserved: !presenterStillOwned,
  };
}

export function configMatchesPresenter(
  source: Record<string, unknown>,
  command: string,
): boolean {
  const expected: PresenterSetting = {
    command,
    when: "herdr",
  };
  const ownership = parseOwnership(source[OWNERSHIP_KEY]);
  return (
    isDeepStrictEqual(source.presenter, expected)
    && Boolean(ownership)
    && isDeepStrictEqual(ownership?.installedPresenter, expected)
  );
}

async function readConfigObject(path: string): Promise<Record<string, unknown>> {
  const value = await readOptionalJson(path);
  if (value === undefined) {
    return {};
  }
  return requireJsonObject(value, path);
}

function parseOwnership(value: unknown): OwnershipMetadata | null {
  if (!isJsonObject(value)) {
    return null;
  }
  const candidate = value;
  if (
    candidate.schema !== 1
    || candidate.owner !== PLUGIN_ID
    || typeof candidate.configuredAt !== "string"
    || typeof candidate.installedPresenter !== "object"
    || candidate.installedPresenter === null
    || Array.isArray(candidate.installedPresenter)
    || typeof candidate.previousPresenter !== "object"
    || candidate.previousPresenter === null
    || Array.isArray(candidate.previousPresenter)
  ) {
    return null;
  }
  const installed = candidate.installedPresenter as Record<string, unknown>;
  const previous = candidate.previousPresenter as Record<string, unknown>;
  if (
    typeof installed.command !== "string"
    || installed.when !== "herdr"
    || typeof previous.present !== "boolean"
  ) {
    return null;
  }
  return {
    schema: 1,
    owner: PLUGIN_ID,
    installedPresenter: {
      command: installed.command,
      when: "herdr",
    },
    previousPresenter: {
      present: previous.present,
      ...(Object.hasOwn(previous, "value") ? { value: previous.value } : {}),
    },
    configuredAt: candidate.configuredAt,
  };
}
