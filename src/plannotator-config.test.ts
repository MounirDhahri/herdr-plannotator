import { describe, expect, test } from "bun:test";

import {
  configureDocument,
  unconfigureDocument,
} from "./plannotator-config.ts";

describe("Plannotator config ownership", () => {
  test("preserves unrelated config and restores a previous presenter", () => {
    const source = {
      theme: "dark",
      presenter: {
        command: "/custom/presenter",
        when: "always",
      },
    };
    const configured = configureDocument(source, "/plugin/presenter", "2026-01-01T00:00:00Z");

    expect(configured.theme).toBe("dark");
    expect(configured.presenter).toEqual({
      command: "/plugin/presenter",
      when: "herdr",
    });

    const removed = unconfigureDocument(configured);
    expect(removed.presenterRestored).toBe(true);
    expect(removed.document).toEqual(source);
  });

  test("reconfigure retains the original previous presenter", () => {
    const first = configureDocument(
      { presenter: { command: "/original", when: "always" } },
      "/plugin/old",
      "2026-01-01T00:00:00Z",
    );
    const second = configureDocument(
      first,
      "/plugin/new",
      "2026-01-02T00:00:00Z",
    );
    const removed = unconfigureDocument(second);

    expect(removed.document.presenter).toEqual({
      command: "/original",
      when: "always",
    });
  });

  test("unconfigure preserves a presenter changed by the user", () => {
    const configured = configureDocument({}, "/plugin/presenter", "2026-01-01T00:00:00Z");
    configured.presenter = {
      command: "/user/replacement",
      when: "always",
    };
    const removed = unconfigureDocument(configured);

    expect(removed.presenterPreserved).toBe(true);
    expect(removed.document.presenter).toEqual({
      command: "/user/replacement",
      when: "always",
    });
    expect(removed.document).not.toHaveProperty("_herdrPlannotator");
  });

  test("configure refuses to overwrite unrecognized ownership metadata", () => {
    expect(() => configureDocument(
      { _herdrPlannotator: { owner: "someone-else" } },
      "/plugin/presenter",
      "2026-01-01T00:00:00Z",
    )).toThrow("refusing to overwrite");
  });
});
