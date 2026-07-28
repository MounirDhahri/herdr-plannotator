import { describe, expect, test } from "bun:test";

import { presenterEnvironmentCheck } from "./configuration.ts";

const PRESENTER = "/plugins/plannotator/bin/herdr-plannotator-present";

describe("presenter environment doctor check", () => {
  test("adds no check when PLANNOTATOR_PRESENTER is absent", () => {
    expect(presenterEnvironmentCheck(PRESENTER, {})).toBeNull();
  });

  test("rejects an explicitly empty PLANNOTATOR_PRESENTER", () => {
    expect(presenterEnvironmentCheck(PRESENTER, {
      PLANNOTATOR_PRESENTER: "",
    })).toEqual({
      name: "Presenter environment override",
      ok: false,
      detail: "PLANNOTATOR_PRESENTER is set but empty, which disables the configured presenter",
    });
  });

  test("rejects an environment presenter that overrides the managed helper", () => {
    expect(presenterEnvironmentCheck(PRESENTER, {
      PLANNOTATOR_PRESENTER: "/custom/presenter",
    })).toEqual({
      name: "Presenter environment override",
      ok: false,
      detail: "PLANNOTATOR_PRESENTER overrides config.json; unset it or point it at the managed presenter",
    });
  });

  test("accepts an environment override that matches the managed helper", () => {
    expect(presenterEnvironmentCheck(PRESENTER, {
      PLANNOTATOR_PRESENTER: `  ${PRESENTER}  `,
    })).toEqual({
      name: "Presenter environment override",
      ok: true,
      detail: `${PRESENTER} (matches the managed presenter)`,
    });
  });
});
