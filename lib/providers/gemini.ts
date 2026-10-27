import {
  createWorkDir,
  estimateProgress,
  fetchJson,
  humanizeMs,
  ingestRemoteVideo,
  pickVideoUrl,
  readJsonObjectEnv,
  readPositiveIntEnv,
  readReferenceInline,
  sleep,
  summarise,
} from "./remote";
import type {
  ProgressCallback,
  ProviderRenderInput,
  ProviderRenderOutput,
  VideoProvider,
} from "./types";

/**
 * GeminiProvider — video generation on Google's Gemini API with Gemini Omni.
 *
 * Uses the Google Interactions API (`POST /v1beta/interactions`) with
 * `gemini-omni-1.1-flash` as the primary video generation model.
 * Also supports legacy long-running operations for backward compatibility.
 */

const DEFAULT_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-omni-1.1-flash";
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_POLL_MS = 5_000;
/** Rough wall-clock expectation for one short render; only shapes the bar. */
const EXPECTED_RENDER_MS = 90_000;

function resolveModel(model: string): string {
  return model;
}

/** A long-running operation, as the legacy Gemini API returns it. */
interface GeminiOperation {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string; status?: string } | null;
  response?: unknown;
}

/**
 * Find the generated video's URI in legacy Veo responses.
 */
function findGeneratedVideoUri(response: unknown): string | null {
  const visit = (value: unknown, depth: number): string | null => {
    if (depth > 6 || value == null || typeof value !== "object") return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    const video = record.video;
    if (video && typeof video === "object") {
      const uri = (video as Record<string, unknown>).uri;
      if (typeof uri === "string" && /^https?:\/\//i.test(uri)) return uri;
    }

    for (const item of Object.values(record)) {
      const found = visit(item, depth + 1);
      if (found) return found;
    }

    return null;
  };

  return visit(response, 0);
}

/**
 * Find video data (base64 or URL) in an Interactions API response.
 */
function findInteractionVideo(response: unknown): { buffer?: Buffer; url?: string } | null {
  if (!response || typeof response !== "object") return null;

  const root = response as Record<string, unknown>;

  // 1. Direct output_video.data field
  const outputVideo = root.output_video as { data?: string } | undefined;
  if (outputVideo?.data && typeof outputVideo.data === "string") {
    return { buffer: Buffer.from(outputVideo.data, "base64") };
  }

  // 2. Steps array
  if (Array.isArray(root.steps)) {
    for (const step of root.steps) {
      if (!step || typeof step !== "object") continue;
      const contentList = (step as { content?: unknown[] }).content;
      if (Array.isArray(contentList)) {
        for (const item of contentList) {
          if (!item || typeof item !== "object") continue;
          const content = item as { type?: string; data?: string; url?: string; uri?: string };
          if (content.type === "video" || content.data) {
            if (content.data && typeof content.data === "string") {
              return { buffer: Buffer.from(content.data, "base64") };
            }
            if (content.url && typeof content.url === "string") {
              return { url: content.url };
            }
            if (content.uri && typeof content.uri === "string") {
              return { url: content.uri };
            }
          }
        }
      }
    }
  }

  // 3. Fallback to URI search
  const foundUri = findGeneratedVideoUri(response) ?? pickVideoUrl(response);
  if (foundUri) return { url: foundUri };

  return null;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  apiBase: string;
  /** Model-specific parameters merged over the derived ones (resolution, …). */
  parameters?: Record<string, unknown>;
  timeoutMs: number;
  pollIntervalMs: number;
}

export function geminiConfig(
  overrides: { apiKey?: string; model?: string | null } = {}
): GeminiConfig {
  const apiKey =
    overrides.apiKey?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Gemini video generation requires an API key. Add one on the Settings → " +
        "API keys page, or set GEMINI_API_KEY in .env. Create one at " +
        "https://aistudio.google.com/apikey (GOOGLE_API_KEY is also accepted)."
    );
  }

  return {
    apiKey,
    model: resolveModel(
      (overrides.model?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL).replace(
        /^\/+|\/+$/g,
        ""
      )
    ),
    apiBase: (process.env.GEMINI_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, ""),
    parameters: readJsonObjectEnv("GEMINI_INPUT"),
    timeoutMs: readPositiveIntEnv("GEMINI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    pollIntervalMs: readPositiveIntEnv("GEMINI_POLL_MS", DEFAULT_POLL_MS),
  };
}

export function readGeminiConfig(): GeminiConfig {
  return geminiConfig();
}

export class GeminiProvider implements VideoProvider {
  readonly name = "gemini";
  private readonly config: GeminiConfig;

  constructor(config: Partial<GeminiConfig> & { apiKey: string }) {
    this.config = {
      apiKey: config.apiKey,
      model: resolveModel(config.model ?? DEFAULT_MODEL),
      apiBase: (config.apiBase || DEFAULT_API_BASE).replace(/\/+$/, ""),
      parameters: config.parameters,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_MS,
    };
  }

  async render(
    input: ProviderRenderInput,
    onProgress: ProgressCallback
  ): Promise<ProviderRenderOutput> {
    const { dir, cleanup } = await createWorkDir("lumen-gemini-");

    try {
      await onProgress(2);

      if (this.isInteractionsModel(this.config.model)) {
        return await this.renderInteraction(input, dir, cleanup, onProgress);
      }

      return await this.renderLegacyOperation(input, dir, cleanup, onProgress);
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  private isInteractionsModel(model: string): boolean {
    return model.includes("omni") || model.startsWith("gemini-");
  }

  private headers(): Record<string, string> {
    return {
      "x-goog-api-key": this.config.apiKey,
      "Content-Type": "application/json",
    };
  }

  private parameters(input: ProviderRenderInput): Record<string, unknown> {
    const aspect = input.aspect === "1:1" ? {} : { aspectRatio: input.aspect };
    return { ...aspect, ...this.config.parameters };
  }

  private async instance(input: ProviderRenderInput): Promise<Record<string, unknown>> {
    const instance: Record<string, unknown> = { prompt: input.prompt };
    const reference = input.references?.[0];
    if (reference) {
      instance.image = await readReferenceInline(reference);
    }
    return instance;
  }

  /** Render using Google's Interactions API for gemini-omni-1.1-flash. */
  private async renderInteraction(
    input: ProviderRenderInput,
    dir: string,
    cleanup: () => Promise<void>,
    onProgress: ProgressCallback
  ): Promise<ProviderRenderOutput> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      input: input.prompt,
      background: true,
      ...this.config.parameters,
    };

    if (input.references?.[0]) {
      const ref = await readReferenceInline(input.references[0]);
      body.reference_image = ref.bytesBase64Encoded;
    }

    let response: unknown;
    try {
      response = await fetchJson<unknown>(
        `${this.config.apiBase}/interactions`,
        {
          method: "POST",
          headers: this.headers(),
          body,
          timeoutMs: 60_000,
          retries: 4,
          retryDelayMs: 6_000,
        }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("limit: 0 input tokens")) {
        throw new Error(
          `Google AI Studio rate limit: Model ${this.config.model} has 0 tokens/min quota on the Free Tier. Video generation with Gemini Omni requires a billed Google AI Studio account (https://aistudio.google.com) or Google Cloud Vertex AI.`
        );
      }
      if (msg.includes("spending cap") || msg.includes("spend cap")) {
        throw new Error(
          `Google AI Studio monthly spending cap exceeded: Your Google account reached its spend limit. Increase or manage your project spend cap at https://ai.studio/spend`
        );
      }
      if (msg.includes("too_many_requests") || msg.includes("Rate limit exceeded") || msg.includes("429")) {
        throw new Error(
          `Gemini Omni rate limit reached (too many requests in a short time). Please wait 30 seconds and click 'Retry failed clips'.`
        );
      }
      throw err;
    }

    let videoResult = findInteractionVideo(response);
    const interactionRecord = response as Record<string, unknown> | null;
    const interactionId = typeof interactionRecord?.id === "string" ? interactionRecord.id : undefined;

    if (!videoResult && interactionId) {
      const finished = await this.waitForInteraction(interactionId, onProgress);
      videoResult = findInteractionVideo(finished);
    }

    if (!videoResult) {
      throw new Error(
        `Gemini Omni did not return a video output for ${this.config.model}: ${summarise(response)}.`
      );
    }

    const result = await ingestRemoteVideo({
      input,
      videoBuffer: videoResult.buffer,
      videoUrl: videoResult.url,
      providerJobId: interactionId ?? "gemini-omni",
      workDir: dir,
      onProgress,
      label: "Gemini Omni",
      downloadHeaders: this.headers(),
    });

    return { ...result, cleanup };
  }

  private async waitForInteraction(
    interactionId: string,
    onProgress: ProgressCallback
  ): Promise<unknown> {
    const cleanId = interactionId.replace(/^\/?interactions\//, "");
    const url = `${this.config.apiBase}/interactions/${cleanId}`;
    const startedAt = Date.now();

    for (;;) {
      const elapsed = Date.now() - startedAt;

      if (elapsed > this.config.timeoutMs) {
        throw new Error(
          `Gemini Omni interaction ${interactionId} did not finish within ${humanizeMs(this.config.timeoutMs)}.`
        );
      }

      await onProgress(estimateProgress(5, 85, elapsed, EXPECTED_RENDER_MS));

      const current = await fetchJson<Record<string, unknown>>(url, { headers: this.headers() });
      const status = String(current.status ?? "").toLowerCase();

      if (status === "failed" || status === "error") {
        throw new Error(`Gemini Omni interaction failed: ${summarise(current.error ?? current)}.`);
      }

      if (status === "completed" || status === "done" || findInteractionVideo(current)) {
        return current;
      }

      await sleep(this.config.pollIntervalMs);
    }
  }

  /** Legacy predictLongRunning implementation for tests and Veo models. */
  private async renderLegacyOperation(
    input: ProviderRenderInput,
    dir: string,
    cleanup: () => Promise<void>,
    onProgress: ProgressCallback
  ): Promise<ProviderRenderOutput> {
    const started = await this.start(input);
    const operation = started.name;

    if (!operation) {
      throw new Error(
        `Gemini did not return an operation for ${this.config.model}: ${summarise(started)}.`
      );
    }

    const finished = await this.waitForOperation(operation, onProgress);

    const videoUrl =
      findGeneratedVideoUri(finished.response) ?? pickVideoUrl(finished.response);

    if (!videoUrl) {
      throw new Error(
        `Gemini operation ${operation} finished without a video URL ` +
          `(response: ${summarise(finished.response)}).`
      );
    }

    const result = await ingestRemoteVideo({
      input,
      videoUrl,
      providerJobId: operation,
      workDir: dir,
      onProgress,
      label: "Gemini",
      downloadHeaders: this.headers(),
    });

    return { ...result, cleanup };
  }

  private async start(input: ProviderRenderInput): Promise<GeminiOperation> {
    const instances = [await this.instance(input)];

    return fetchJson<GeminiOperation>(
      `${this.config.apiBase}/models/${this.config.model}:predictLongRunning`,
      {
        method: "POST",
        headers: this.headers(),
        body: { instances, parameters: this.parameters(input) },
        timeoutMs: 60_000,
        retries: 1,
      }
    );
  }

  private operationUrl(operation: string): string {
    return `${this.config.apiBase}/${operation.replace(/^\/+/, "")}`;
  }

  private async waitForOperation(
    operation: string,
    onProgress: ProgressCallback
  ): Promise<GeminiOperation> {
    const url = this.operationUrl(operation);
    const startedAt = Date.now();

    for (;;) {
      const elapsed = Date.now() - startedAt;

      if (elapsed > this.config.timeoutMs) {
        await this.cancel(url);
        throw new Error(
          `Gemini operation ${operation} did not finish within ` +
            `${humanizeMs(this.config.timeoutMs)} and was cancelled.`
        );
      }

      await onProgress(estimateProgress(5, 85, elapsed, EXPECTED_RENDER_MS));

      const current = await fetchJson<GeminiOperation>(url, { headers: this.headers() });

      if (current.error) {
        const reason = current.error.message ?? current.error.status ?? "unknown error";
        throw new Error(`Gemini operation ${operation} failed: ${reason}.`);
      }

      if (current.done) return current;

      await sleep(this.config.pollIntervalMs);
    }
  }

  private async cancel(operationUrl: string): Promise<void> {
    await fetchJson(`${operationUrl}:cancel`, {
      method: "POST",
      headers: this.headers(),
      retries: 0,
    }).catch(() => {});
  }
}
