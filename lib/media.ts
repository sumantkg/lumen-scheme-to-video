import { Readable } from "node:stream";

import { getStorage } from "@/lib/storage";

/**
 * Serves a stored file over HTTP with Range support.
 *
 * Range handling matters for more than seeking: Safari's `<video>` element
 * refuses to play an MP4 served with a plain 200 response unless the server
 * advertises `Accept-Ranges: bytes` and answers byte requests.
 */

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain",
  ".json": "application/json",
};

export function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf(".");
  return (dot >= 0 ? MIME[key.slice(dot).toLowerCase()] : undefined) ?? "application/octet-stream";
}

interface ByteRange {
  start: number;
  end: number;
}

/** Parse a single `bytes=` range header. Returns null when unsatisfiable. */
function parseRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;

  if (rawStart === "") {
    // Suffix form: the final N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;

  return { start, end: Math.min(end, size - 1) };
}

function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

export async function serveStoredFile(
  request: Request,
  key: string | null,
  options: { download?: string; mime?: string; filename?: string } = {}
): Promise<Response> {
  if (!key) return new Response("Not found", { status: 404 });

  const storage = getStorage();
  if (!(await storage.exists(key))) {
    return new Response("Not found", { status: 404 });
  }

  const size = await storage.size(key);
  const headers = new Headers({
    "Content-Type": options.mime ?? contentTypeFor(key),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });

  if (options.download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${options.download.replace(/["\\]/g, "")}"`
    );
  } else {
    // Force inline display so browsers render PDFs/images instead of downloading
    const fname = options.filename ?? key.split("/").pop() ?? "file";
    headers.set("Content-Disposition", `inline; filename="${fname.replace(/["\\]/g, "")}"`);
  }

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);
    if (!range) {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }

    const stream = await storage.readStream(key, range);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(toWebStream(stream), { status: 206, headers });
  }

  const stream = await storage.readStream(key);
  headers.set("Content-Length", String(size));
  return new Response(toWebStream(stream), { status: 200, headers });
}
