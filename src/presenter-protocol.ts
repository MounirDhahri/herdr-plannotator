import {
  MAX_PROTOCOL_BYTES,
  PRESENTER_PROTOCOL,
} from "./constants.ts";
import { isJsonObject } from "./json-file.ts";

export type PresentationHandle = {
  paneId: string;
};

export type PresenterRequest =
  | {
    protocol: typeof PRESENTER_PROTOCOL;
    action: "present";
    url: string;
    kind: string;
  }
  | {
    protocol: typeof PRESENTER_PROTOCOL;
    action: "dismiss";
    handle: PresentationHandle;
  };

export type PresenterResponse =
  | {
    protocol: typeof PRESENTER_PROTOCOL;
    ok: true;
    handle?: PresentationHandle;
  }
  | {
    protocol: typeof PRESENTER_PROTOCOL;
    ok: false;
    error: {
      code: string;
      message: string;
    };
  };

export function parsePresenterRequest(input: string): PresenterRequest {
  if (Buffer.byteLength(input, "utf8") > MAX_PROTOCOL_BYTES) {
    throw protocolError("request_too_large", "presenter request exceeds 64 KiB");
  }
  const records = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (records.length !== 1) {
    throw protocolError("invalid_request", "expected exactly one JSON record");
  }

  let value: unknown;
  try {
    value = JSON.parse(records[0]);
  } catch {
    throw protocolError("invalid_json", "presenter request is not valid JSON");
  }
  if (!isJsonObject(value) || value.protocol !== PRESENTER_PROTOCOL) {
    throw protocolError("unsupported_protocol", "presenter protocol 1 is required");
  }

  if (value.action === "present") {
    if (typeof value.url !== "string" || !isLoopbackUrl(value.url)) {
      throw protocolError(
        "invalid_request",
        "present requires an HTTP loopback URL without credentials",
      );
    }
    if (
      typeof value.kind !== "string"
      || !/^[a-z][a-z0-9-]{0,63}$/.test(value.kind)
    ) {
      throw protocolError("invalid_request", "present requires a valid kind");
    }
    return {
      protocol: PRESENTER_PROTOCOL,
      action: "present",
      url: value.url,
      kind: value.kind,
    };
  }

  if (value.action === "dismiss") {
    if (
      !isJsonObject(value.handle)
      || typeof value.handle.paneId !== "string"
      || value.handle.paneId.length === 0
    ) {
      throw protocolError(
        "invalid_request",
        "dismiss requires a handle with paneId",
      );
    }
    return {
      protocol: PRESENTER_PROTOCOL,
      action: "dismiss",
      handle: {
        paneId: value.handle.paneId,
      },
    };
  }

  throw protocolError("invalid_action", "action must be present or dismiss");
}

export class PresenterProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PresenterProtocolError";
    this.code = code;
  }
}

function protocolError(code: string, message: string): PresenterProtocolError {
  return new PresenterProtocolError(code, message);
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.username === ""
      && url.password === ""
      && (
        url.hostname === "localhost"
        || url.hostname === "127.0.0.1"
        || url.hostname === "[::1]"
        || url.hostname === "::1"
      )
    );
  } catch {
    return false;
  }
}
