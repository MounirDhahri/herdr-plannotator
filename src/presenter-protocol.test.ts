import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import {
  parsePresenterRequest,
  PresenterProtocolError,
} from "./presenter-protocol.ts";
import { presenterExecutablePath } from "./paths.ts";

describe("presenter protocol", () => {
  test("parses one present record", () => {
    expect(parsePresenterRequest(
      '{"protocol":1,"action":"present","url":"http://127.0.0.1:43127","kind":"plan"}\n',
    )).toEqual({
      protocol: 1,
      action: "present",
      url: "http://127.0.0.1:43127",
      kind: "plan",
    });
  });

  test("parses one dismiss record", () => {
    expect(parsePresenterRequest(JSON.stringify({
      protocol: 1,
      action: "dismiss",
      handle: {
        paneId: "w1:p4",
      },
    }))).toEqual({
      protocol: 1,
      action: "dismiss",
      handle: {
        paneId: "w1:p4",
      },
    });
  });

  test("rejects non-loopback and credentialed URLs", () => {
    for (const url of [
      "https://example.com",
      "http://user:password@localhost:43127",
    ]) {
      expect(() => parsePresenterRequest(JSON.stringify({
        protocol: 1,
        action: "present",
        url,
        kind: "plan",
      }))).toThrow("present requires an HTTP loopback URL without credentials");
    }
  });

  test("rejects multiple records", () => {
    expect(() => parsePresenterRequest(
      '{"protocol":1,"action":"present"}\n{"protocol":1,"action":"dismiss"}\n',
    )).toThrow(PresenterProtocolError);
  });

  test("rejects unsupported protocols", () => {
    expect(() => parsePresenterRequest(
      '{"protocol":2,"action":"present","url":"http://localhost:1","kind":"plan"}',
    )).toThrow("presenter protocol 1 is required");
  });

  test("executable emits exactly one structured failure record", () => {
    const result = spawnSync(presenterExecutablePath(), [], {
      encoding: "utf8",
      env: {
        ...process.env,
        HERDR_ENV: "0",
      },
      input: '{"protocol":1,"action":"present","url":"http://localhost:43127","kind":"plan"}\n',
    });
    const records = result.stdout.trim().split(/\r?\n/);
    expect(result.status).toBe(1);
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0])).toEqual({
      protocol: 1,
      ok: false,
      error: {
        code: "not_in_herdr",
        message: "present requires a running Herdr session",
      },
    });
  });
});
