import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  integrationConfigPath,
  plannotatorDataDir,
} from "./paths.ts";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("configuration paths", () => {
  test("matches Plannotator's legacy-first data directory", () => {
    const home = temporaryHome();
    mkdirSync(join(home, ".plannotator"));
    expect(plannotatorDataDir({
      XDG_DATA_HOME: join(home, "xdg"),
    }, home)).toBe(join(home, ".plannotator"));
  });

  test("honors PLANNOTATOR_DATA_DIR tilde expansion", () => {
    const home = temporaryHome();
    expect(plannotatorDataDir({
      PLANNOTATOR_DATA_DIR: "~/custom",
    }, home)).toBe(join(home, "custom"));
  });

  test("resolves relative PLANNOTATOR_DATA_DIR from the focused pane cwd", () => {
    const home = temporaryHome();
    const project = join(home, "project");
    expect(plannotatorDataDir({
      PLANNOTATOR_DATA_DIR: ".plannotator-data",
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
        focused_pane_cwd: project,
      }),
    }, home)).toBe(join(project, ".plannotator-data"));
  });

  test("rejects a relative PLANNOTATOR_DATA_DIR without a focused pane cwd", () => {
    const home = temporaryHome();
    expect(() => plannotatorDataDir({
      PLANNOTATOR_DATA_DIR: ".plannotator-data",
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
        focused_pane_cwd: "",
      }),
    }, home)).toThrow("use an absolute or ~/... path instead");
  });

  test("uses the authoritative plugin config directory in actions", () => {
    const home = temporaryHome();
    expect(integrationConfigPath({
      HERDR_PLUGIN_CONFIG_DIR: join(home, "plugin-config"),
    }, home)).toBe(join(home, "plugin-config", "integration.json"));
  });
});

function temporaryHome(): string {
  const path = mkdtempSync(join(tmpdir(), "herdr-plannotator-"));
  temporaryPaths.push(path);
  return path;
}
