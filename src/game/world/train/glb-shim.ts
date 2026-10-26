/**
 * Node shims so GLTFLoader can read /assets/jeep/train/*.glb straight from
 * public/ (undici rejects site-relative URLs, so patch Request and fetch).
 * Import for side effects only.
 */
import fs from "node:fs";
import path from "node:path";

if (typeof (globalThis as { self?: unknown }).self === "undefined") {
  (globalThis as { self?: unknown }).self = globalThis;
}

// Serve /assets/jeep/train/*.glb straight from public/.
const ROOT = path.resolve(__dirname, "../../../..");
const realFetch = globalThis.fetch.bind(globalThis);
(globalThis as { ProgressEvent?: unknown }).ProgressEvent = class {
  type: string;
  lengthComputable: boolean;
  loaded: number;
  total: number;
  constructor(type: string, init?: { lengthComputable?: boolean; loaded?: number; total?: number }) {
    this.type = type;
    this.lengthComputable = init?.lengthComputable ?? false;
    this.loaded = init?.loaded ?? 0;
    this.total = init?.total ?? 0;
  }
};
const RealRequest = globalThis.Request;
globalThis.Request = class extends RealRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    super(url.startsWith("/") ? `http://localhost${url}` : input as RequestInfo, init);
  }
} as typeof Request;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(raw, "http://localhost").pathname;
  if (pathname.startsWith("/assets/jeep/train/")) {
    const body = fs.readFileSync(path.join(ROOT, "public", pathname));
    return new Response(body, { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;
