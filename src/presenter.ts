import {
  MAX_PROTOCOL_BYTES,
  MIN_HERDR_VERSION,
  PRESENTER_PROTOCOL,
} from "./constants.ts";
import {
  BrowserPaneError,
  closeBrowserPane,
  openBrowserPane,
} from "./browser-pane.ts";
import {
  herdrVersionSupported,
  resolveHerdrExecutable,
  resolveRuntime,
} from "./herdr.ts";
import {
  parsePresenterRequest,
  PresenterProtocolError,
  type PresenterResponse,
} from "./presenter-protocol.ts";

export async function runPresenter(
  inputReader: () => Promise<string> = readStdin,
  outputWriter: (record: PresenterResponse) => void = writeRecord,
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<number> {
  try {
    const request = parsePresenterRequest(await inputReader());
    requireHerdrContext(request.action);
    if (request.action === "present") {
      const runtime = await resolveRuntime({ signal: options.signal });
      if (!herdrVersionSupported(runtime.herdrVersion)) {
        throw new PresenterProtocolError(
          "unsupported_herdr",
          `Herdr ${MIN_HERDR_VERSION} or newer is required; found ${runtime.herdrVersion}`,
        );
      }
      const handle = await openBrowserPane(
        runtime,
        request.url,
        {
          env: process.env,
          signal: options.signal,
        },
      );
      outputWriter({
        protocol: PRESENTER_PROTOCOL,
        ok: true,
        handle,
      });
    } else {
      const herdrBin = await resolveHerdrExecutable();
      await closeBrowserPane(
        herdrBin,
        request.handle,
        {
          env: process.env,
          signal: options.signal,
        },
      );
      outputWriter({
        protocol: PRESENTER_PROTOCOL,
        ok: true,
      });
    }
    return 0;
  } catch (error) {
    outputWriter(errorResponse(error));
    return 1;
  }
}

export function errorResponse(error: unknown): PresenterResponse {
  const code = error instanceof PresenterProtocolError
    ? error.code
    : error instanceof BrowserPaneError
      ? error.code
      : "presenter_failed";
  const message = error instanceof Error ? error.message : String(error);
  return {
    protocol: PRESENTER_PROTOCOL,
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function requireHerdrContext(action: "present" | "dismiss"): void {
  if (process.env.HERDR_ENV !== "1" || !process.env.HERDR_SOCKET_PATH?.trim()) {
    throw new PresenterProtocolError(
      "not_in_herdr",
      `${action} requires a running Herdr session`,
    );
  }
  if (action === "present" && !process.env.HERDR_PANE_ID?.trim()) {
    throw new PresenterProtocolError(
      "missing_source_pane",
      "present requires HERDR_PANE_ID",
    );
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_PROTOCOL_BYTES) {
      throw new PresenterProtocolError(
        "request_too_large",
        "presenter request exceeds 64 KiB",
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeRecord(record: PresenterResponse): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}
