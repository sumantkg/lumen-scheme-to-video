import {
  applyReferenceTemplate,
  createWorkDir,
  estimateProgress,
  fetchJson,
  humanizeMs,
  ingestRemoteVideo,
  pickVideoUrl,
  readJsonObjectEnv,
  readPositiveIntEnv,
  referenceToDataUrl,
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
 * FalProvider — text-to-video on fal.ai.
 *
 * Same shape as the Replicate provider: submit to the queue, poll the status
 * URL, fetch the result, then let the shared ingest step download and re-encode
 * to the requested aspect and duration.
 */

const DEFAULT_QUEUE_BASE = "https://queue.fal.run";
const DEFAULT_MODEL = "fal-ai/wan/v2.2-5b/text-to-video/fast-wan";
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_POLL_MS = 3_000;
const EXPECTED_RENDER_MS = 60_000;

type FalStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";

interface FalQueued {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
}

interface FalStatusResponse {
  status?: FalStatus | string;
  queue_position?: number;
}

export interface FalConfig {
  key: string;
  model: string;
  queueBase: string;
  /** Model-specific inputs merged over the defaults. */
  input?: Record<string, unknown>;
  /** Input field that should receive a bound reference image as a data URL. */
  referenceInput?: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

export function falConfig(overrides: { key?: string; model?: string | null } = {}): FalConfig {
  // A per-user key from the credential vault wins; `FAL_KEY` is the operator
  // fallback.
  const key = overrides.key?.trim() || process.env.FAL_KEY?.trim();
  if (!key) {
    throw new Error(
      "fal video generation requires a key. Add one on the Settings → API keys " +
        "page, or set FAL_KEY in .env. Create one at https://fal.ai/dashboard/keys."
    );
  }

  return {
    key,
    model: (overrides.model?.trim() || process.env.FAL_MODEL?.trim() || DEFAULT_MODEL).replace(
      /^\/+|\/+$/g,
      ""
    ),
    queueBase: (process.env.FAL_QUEUE_BASE?.trim() || DEFAULT_QUEUE_BASE).replace(/\/+$/, ""),
    input: readJsonObjectEnv("FAL_INPUT"),
    referenceInput: process.env.FAL_REFERENCE_INPUT?.trim() || undefined,
    timeoutMs: readPositiveIntEnv("FAL_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    pollIntervalMs: readPositiveIntEnv("FAL_POLL_MS", DEFAULT_POLL_MS),
  };
}

export function readFalConfig(): FalConfig {
  return falConfig();
}

export class FalProvider implements VideoProvider {
  readonly name = "fal";

  constructor(private readonly config: FalConfig) {}

  async render(
    input: ProviderRenderInput,
    onProgress: ProgressCallback
  ): Promise<ProviderRenderOutput> {
    const { dir, cleanup } = await createWorkDir("lumen-fal-");

    try {
      await onProgress(2);

      const queued = await this.submit(input);
      const requestId = queued.request_id;
      if (!requestId) {
        throw new Error(`fal did not return a request id for ${this.config.model}: ${summarise(queued)}.`);
      }

      const statusUrl = queued.status_url ?? this.requestUrl(requestId, "status");
      const responseUrl = queued.response_url ?? this.requestUrl(requestId);

      await this.waitForCompletion(statusUrl, requestId, onProgress);

      const output = await fetchJson<unknown>(responseUrl, { headers: this.headers() });
      const videoUrl = pickVideoUrl(output);

      if (!videoUrl) {
        throw new Error(
          `fal request ${requestId} completed without a video URL ` +
            `(response: ${summarise(output)}).`
        );
      }

      const result = await ingestRemoteVideo({
        input,
        videoUrl,
        providerJobId: requestId,
        workDir: dir,
        onProgress,
        label: "fal",
      });

      return { ...result, cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  private headers(): Record<string, string> {
    return { authorization: `Key ${this.config.key}` };
  }

  private requestUrl(requestId: string, suffix?: string): string {
    const base = `${this.config.queueBase}/${this.config.model}/requests/${requestId}`;
    return suffix ? `${base}/${suffix}` : base;
  }

  private async submit(input: ProviderRenderInput): Promise<FalQueued> {
    const reference = input.references?.[0];
    let body: Record<string, unknown> = { prompt: input.prompt, ...this.config.input };

    if (reference) {
      const dataUrl = await referenceToDataUrl(reference);
      body = applyReferenceTemplate(body, dataUrl);
      if (this.config.referenceInput) body[this.config.referenceInput] = dataUrl;
    }

    return fetchJson<FalQueued>(`${this.config.queueBase}/${this.config.model}`, {
      method: "POST",
      headers: this.headers(),
      body,
      timeoutMs: 60_000,
      retries: 1,
    });
  }

  private async waitForCompletion(
    statusUrl: string,
    requestId: string,
    onProgress: ProgressCallback
  ): Promise<void> {
    const startedAt = Date.now();

    for (;;) {
      const elapsed = Date.now() - startedAt;

      if (elapsed > this.config.timeoutMs) {
        await this.cancel(requestId);
        throw new Error(
          `fal request ${requestId} did not finish within ` +
            `${humanizeMs(this.config.timeoutMs)} and was cancelled.`
        );
      }

      const status = await fetchJson<FalStatusResponse>(`${statusUrl}?logs=0`, {
        headers: this.headers(),
      });

      if (status.status === "COMPLETED") return;

      if (status.status === "IN_QUEUE") {
        // Queued work barely moves the bar — it hasn't started rendering yet.
        await onProgress(estimateProgress(2, 12, elapsed, 30_000));
      } else {
        await onProgress(estimateProgress(12, 85, elapsed, EXPECTED_RENDER_MS));
      }

      await sleep(this.config.pollIntervalMs);
    }
  }

  /** Best effort — a cancelled request stops the meter. */
  private async cancel(requestId: string): Promise<void> {
    await fetchJson(this.requestUrl(requestId, "cancel"), {
      method: "PUT",
      headers: this.headers(),
      retries: 0,
    }).catch(() => {});
  }
}
