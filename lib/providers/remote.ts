import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { ASPECT_DIMENSIONS, clampDurationSeconds } from "./dimensions";
import { extractPoster, normalizeVideo, probeVideo } from "./ffmpeg";
import type {
  ProgressCallback,
  ProviderRenderInput,
  ProviderRenderOutput,
} from "./types";

/**
 * Plumbing shared by every hosted provider (Replicate, fal, …).
 *
 * A provider is only responsible for *submitting a prediction and polling it
 * until a video URL exists*. Everything after that — downloading, verifying,
 * re-encoding to the requested aspect/duration, poster, temp-dir lifecycle —
 * lives here, so providers stay small and behave identically.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network-level failure
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Pull a human-readable reason out of an error body. */
function describeErrorBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ["detail", "error", "message", "title"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
      if (value && typeof value === "object") return JSON.stringify(value).slice(0, 300);
    }
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return trimmed.slice(0, 300);
}

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Extra attempts after the first, for transient failures. */
  retries?: number;
  retryDelayMs?: number;
}

/**
 * JSON fetch with a per-request timeout and bounded retries.
 *
 * Polling loops call this dozens of times per job, so a single dropped
 * connection must not fail a render that is otherwise progressing fine.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const {
    method = "GET",
    headers,
    body,
    timeoutMs = 30_000,
    retries = 3,
    retryDelayMs = 1_000,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(retryDelayMs * attempt);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const text = await response.text();

      if (!response.ok) {
        const detail = describeErrorBody(text);
        const error = new HttpError(
          `${method} ${url} → ${response.status} ${response.statusText}` +
            (detail ? `: ${detail}` : ""),
          response.status
        );
        if (attempt < retries && isRetryableStatus(response.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }

      if (!text.trim()) return undefined as T;
      return JSON.parse(text) as T;
    } catch (error) {
      // A 4xx from the remote API is a real answer — don't hammer it.
      if (error instanceof HttpError && !isRetryableStatus(error.status)) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface DownloadFileOptions {
  /** Bytes received so far, and the total when the server declares one. */
  onProgress?: (received: number, total: number) => void;
  timeoutMs?: number;
  /** Extra request headers — some APIs authenticate the media download too. */
  headers?: Record<string, string>;
}

/** Stream a URL to disk, reporting bytes as they land. */
export async function downloadFile(
  url: string,
  destPath: string,
  options: DownloadFileOptions = {}
): Promise<number> {
  const { onProgress, timeoutMs = 10 * 60_000, headers } = options;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok || !response.body) {
    throw new HttpError(
      `Failed to download render (${response.status} ${response.statusText})`,
      response.status
    );
  }

  const total = Number(response.headers.get("content-length") ?? 0) || 0;
  let received = 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      onProgress?.(received, total);
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    counter,
    createWriteStream(destPath)
  );

  return received;
}

/**
 * Find the playable URL in whatever shape a provider calls its output.
 *
 * Model authors return `"https://…/out.mp4"`, `["https://…/out.mp4"]`,
 * `{ video: { url } }`, `{ videos: [{ url }] }` — all of it shows up in the
 * wild, so known shapes are tried first and a deep search is the safety net.
 */
export function pickVideoUrl(output: unknown): string | null {
  const looksLikeMedia = (value: string) => /^https?:\/\//i.test(value);

  const visit = (value: unknown, depth: number): string | null => {
    if (depth > 6 || value == null) return null;

    if (typeof value === "string") return looksLikeMedia(value) ? value : null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      // Prefer obvious keys before falling back to scanning everything.
      for (const key of ["video", "videos", "output", "url", "file"]) {
        if (key in record) {
          const found = visit(record[key], depth + 1);
          if (found) return found;
        }
      }
      for (const item of Object.values(record)) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
    }

    return null;
  };

  return visit(output, 0);
}

/**
 * Progress estimate for a step whose real completion the API never reports.
 *
 * Ramps towards `end` asymptotically, so the bar keeps moving without ever
 * claiming the render is finished before it is.
 */
export function estimateProgress(
  start: number,
  end: number,
  elapsedMs: number,
  expectedMs: number
): number {
  const ratio = 1 - Math.exp(-elapsedMs / Math.max(1, expectedMs));
  return Math.round(start + (end - start) * ratio);
}

/**
 * Parse a JSON-object env var, e.g.
 * `REPLICATE_INPUT='{"aspect_ratio":"9:16"}'`.
 *
 * Model inputs differ wildly between text-to-video models, so each provider
 * exposes an escape hatch instead of guessing a per-model schema.
 */
export function readJsonObjectEnv(name: string): Record<string, unknown> | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${name} must be valid JSON (${error instanceof Error ? error.message : String(error)}).`
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object, e.g. {"aspect_ratio":"9:16"}.`);
  }

  return parsed as Record<string, unknown>;
}

/**
 * Parse a JSON-array env var, e.g. `HF_SPACE_ARGS='["{prompt}", 2]'`.
 *
 * Gradio calls take a positional argument list, and every Space declares its
 * own, so the escape hatch has to be ordered like the endpoint expects.
 */
export function readJsonArrayEnv(name: string): unknown[] | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${name} must be valid JSON (${error instanceof Error ? error.message : String(error)}).`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON array, e.g. ["{prompt}", 2].`);
  }

  return parsed;
}

/** Read a positive integer from the environment, falling back on nonsense. */
export function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/** "45 seconds" / "15 minutes" — for timeout messages. */
export function humanizeMs(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} minutes`;
  return `${Math.max(1, Math.ceil(ms / 1_000))} seconds`;
}

/** Compact, bounded rendering of a value for error messages. */
export function summarise(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (!text) text = String(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** Map a reference file's extension to the mime type providers expect. */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function guessImageMime(filePath: string): string {
  return IMAGE_MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "image/png";
}

/**
 * Read a local reference image for providers that take raw inline bytes
 * (Gemini/Veo's image-to-video `image.bytesBase64Encoded`).
 */
export async function readReferenceInline(filePath: string): Promise<{
  bytesBase64Encoded: string;
  mimeType: string;
}> {
  const bytes = await readFile(filePath);
  return { bytesBase64Encoded: bytes.toString("base64"), mimeType: guessImageMime(filePath) };
}

/** Read a local reference image as a `data:` URL (Replicate, fal). */
export async function referenceToDataUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return `data:${guessImageMime(filePath)};base64,${bytes.toString("base64")}`;
}

/**
 * Replace `{reference}` placeholders in a model-input template.
 *
 * Model-specific input keys differ, so a provider never guesses: an operator
 * points the placeholder at the right field via `*_INPUT`, e.g.
 * `REPLICATE_INPUT='{"first_frame_image":"{reference}"}'`.
 */
export function applyReferenceTemplate(
  input: Record<string, unknown>,
  dataUrl: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] =
      typeof value === "string" && value.includes("{reference}")
        ? value.replace(/\{reference\}/g, dataUrl)
        : value;
  }
  return out;
}

export async function createWorkDir(prefix: string): Promise<{
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export interface IngestOptions {
  input: ProviderRenderInput;
  videoUrl?: string;
  videoBuffer?: Buffer;
  providerJobId?: string;
  workDir: string;
  onProgress: ProgressCallback;
  /** Shown in error messages, e.g. "Replicate". */
  label: string;
  /** Extra headers for the media download (e.g. an API key). */
  downloadHeaders?: Record<string, string>;
}

/**
 * Turn a provider's video URL into a Lumen-ready local asset.
 *
 * Reserves the 88–99 slice of the progress bar for the local work that follows
 * a prediction.
 */
export async function ingestRemoteVideo(options: IngestOptions): Promise<ProviderRenderOutput> {
  const { width, height } = ASPECT_DIMENSIONS[options.input.aspect] ?? ASPECT_DIMENSIONS["16:9"];
  const duration = clampDurationSeconds(options.input.durationSeconds);

  const sourcePath = path.join(options.workDir, "source");
  const videoPath = path.join(options.workDir, "video.mp4");
  const thumbPath = path.join(options.workDir, "thumb.jpg");

  await options.onProgress(88);

  let bytes = 0;
  if (options.videoBuffer) {
    await writeFile(sourcePath, options.videoBuffer);
    bytes = options.videoBuffer.length;
    await options.onProgress(91);
  } else if (options.videoUrl) {
    bytes = await downloadFile(options.videoUrl, sourcePath, {
      headers: options.downloadHeaders,
      onProgress: (received, total) => {
        if (total > 0) {
          // 88 → 91 as the file streams in.
          void options.onProgress(88 + Math.min(3, Math.round((received / total) * 3)));
        }
      },
    });
  } else {
    throw new Error(`${options.label} provided neither a video URL nor video data.`);
  }

  if (bytes === 0) {
    throw new Error(`${options.label} returned an empty video file.`);
  }

  const probe = await probeVideo(sourcePath);
  await options.onProgress(92);

  await normalizeVideo(sourcePath, videoPath, {
    width,
    height,
    durationSeconds: duration,
    hasAudio: probe?.hasAudio ?? false,
    onProgress: (percent) => options.onProgress(92 + Math.round(percent * 0.05)),
  });

  await extractPoster(videoPath, thumbPath, Math.min(1, duration / 2));
  await options.onProgress(99);

  return {
    videoPath,
    thumbPath,
    width,
    height,
    durationSeconds: duration,
    providerJobId: options.providerJobId,
  };
}
