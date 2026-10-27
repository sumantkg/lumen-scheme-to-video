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
 * ReplicateProvider — text-to-video on Replicate.
 *
 * Submit a prediction, poll it, download the resulting MP4, then hand it to the
 * shared ingest step so the output always matches the requested aspect and
 * duration (see `normalizeVideo`) regardless of what the model produced.
 */

const DEFAULT_API_BASE = "https://api.replicate.com/v1";
const DEFAULT_MODEL = "minimax/hailuo-02";
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_POLL_MS = 2_500;
/** Rough wall-clock expectation for one short render; only shapes the bar. */
const EXPECTED_RENDER_MS = 75_000;

type ReplicateStatus = "starting" | "processing" | "succeeded" | "failed" | "canceled";

interface ReplicatePrediction {
  id?: string;
  status?: ReplicateStatus;
  output?: unknown;
  error?: string | null;
  urls?: { get?: string; cancel?: string };
}

export interface ReplicateConfig {
  token: string;
  model: string;
  /** Pinned model version. Sent instead of the model route when present. */
  version?: string;
  apiBase: string;
  /** Model-specific inputs merged over the defaults. */
  input?: Record<string, unknown>;
  /**
   * Input field that should receive a bound reference image as a data URL.
   * Model-specific (e.g. `first_frame_image`), so operators name it.
   */
  referenceInput?: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

/** `owner/name:version-hash` → `["owner/name", "version-hash"]`. */
function splitVersion(model: string): [string, string | undefined] {
  const colon = model.lastIndexOf(":");
  if (colon === -1) return [model, undefined];
  return [model.slice(0, colon), model.slice(colon + 1)];
}

export function replicateConfig(
  overrides: { token?: string; model?: string | null } = {}
): ReplicateConfig {
  // A per-user key from the credential vault wins; `REPLICATE_API_TOKEN` is the
  // operator fallback.
  const token = overrides.token?.trim() || process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Replicate video generation requires a token. Add one on the Settings → " +
        "API keys page, or set REPLICATE_API_TOKEN in .env. Create one at " +
        "https://replicate.com/account/api-tokens."
    );
  }

  const [model, inlineVersion] = splitVersion(
    overrides.model?.trim() || process.env.REPLICATE_MODEL?.trim() || DEFAULT_MODEL
  );

  return {
    token,
    model,
    version: process.env.REPLICATE_MODEL_VERSION?.trim() || inlineVersion,
    apiBase: (process.env.REPLICATE_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, ""),
    input: readJsonObjectEnv("REPLICATE_INPUT"),
    referenceInput: process.env.REPLICATE_REFERENCE_INPUT?.trim() || undefined,
    timeoutMs: readPositiveIntEnv("REPLICATE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    pollIntervalMs: readPositiveIntEnv("REPLICATE_POLL_MS", DEFAULT_POLL_MS),
  };
}

export function readReplicateConfig(): ReplicateConfig {
  return replicateConfig();
}

export class ReplicateProvider implements VideoProvider {
  readonly name = "replicate";

  constructor(private readonly config: ReplicateConfig) {}

  async render(
    input: ProviderRenderInput,
    onProgress: ProgressCallback
  ): Promise<ProviderRenderOutput> {
    const { dir, cleanup } = await createWorkDir("lumen-replicate-");

    try {
      await onProgress(2);

      const created = await this.create(input);
      // Remember how to cancel now: only the create response is guaranteed to
      // carry `urls`, and a timed-out prediction should stop costing money.
      const cancelUrl =
        created.urls?.cancel ?? `${this.config.apiBase}/predictions/${created.id}/cancel`;

      const finished = await this.waitForPrediction(created, cancelUrl, onProgress);
      const videoUrl = pickVideoUrl(finished.output);

      if (!videoUrl) {
        throw new Error(
          `Replicate prediction ${finished.id} succeeded without a video URL ` +
            `(output: ${summarise(finished.output)}).`
        );
      }

      const result = await ingestRemoteVideo({
        input,
        videoUrl,
        providerJobId: finished.id,
        workDir: dir,
        onProgress,
        label: "Replicate",
      });

      // The caller copies the files into storage and then calls `cleanup`.
      return { ...result, cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  /**
   * Only `prompt` is sent by default: Replicate validates inputs strictly (an
   * unknown field is a 422) and every text-to-video model accepts `prompt`.
   * Model-specific knobs go through `REPLICATE_INPUT`; aspect and duration are
   * enforced locally, so they never depend on the model's own parameters.
   *
   * When a scene is bound to a reference image, it is attached as a data URL
   * under `REPLICATE_REFERENCE_INPUT` (model-specific), and `{reference}`
   * placeholders inside `REPLICATE_INPUT` are filled in.
   */
  private async buildInput(input: ProviderRenderInput): Promise<Record<string, unknown>> {
    const base = { prompt: input.prompt, ...this.config.input };
    const reference = input.references?.[0];
    if (!reference) return base;

    const dataUrl = await referenceToDataUrl(reference);
    const templated = applyReferenceTemplate(base, dataUrl);
    if (this.config.referenceInput) {
      templated[this.config.referenceInput] = dataUrl;
    }
    return templated;
  }

  private async create(input: ProviderRenderInput): Promise<ReplicatePrediction> {
    const { apiBase, token, model, version } = this.config;
    const modelInput = await this.buildInput(input);
    const body = version
      ? { version, input: modelInput }
      : { input: modelInput };

    const url = version
      ? `${apiBase}/predictions`
      : `${apiBase}/models/${model}/predictions`;

    const prediction = await fetchJson<ReplicatePrediction>(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body,
      timeoutMs: 60_000,
      retries: 1,
    });

    if (!prediction?.id) {
      throw new Error(
        `Replicate did not return a prediction id for ${model}: ${summarise(prediction)}.`
      );
    }

    return prediction;
  }

  private get(url: string): Promise<ReplicatePrediction> {
    return fetchJson<ReplicatePrediction>(url, {
      headers: { authorization: `Bearer ${this.config.token}` },
    });
  }

  private async waitForPrediction(
    initial: ReplicatePrediction,
    cancelUrl: string,
    onProgress: ProgressCallback
  ): Promise<ReplicatePrediction> {
    const startedAt = Date.now();
    let current = initial;

    while (current.status === "starting" || current.status === "processing") {
      const elapsed = Date.now() - startedAt;

      if (elapsed > this.config.timeoutMs) {
        await this.cancel(cancelUrl);
        throw new Error(
          `Replicate prediction ${current.id} did not finish within ` +
            `${humanizeMs(this.config.timeoutMs)} and was cancelled.`
        );
      }

      await onProgress(estimateProgress(5, 85, elapsed, EXPECTED_RENDER_MS));
      await sleep(this.config.pollIntervalMs);

      const getUrl = current.urls?.get ?? `${this.config.apiBase}/predictions/${current.id}`;
      current = await this.get(getUrl);
    }

    if (current.status !== "succeeded") {
      const reason = current.error ? `: ${current.error}` : "";
      throw new Error(
        `Replicate prediction ${current.id} ${current.status ?? "returned no status"}${reason}.`
      );
    }

    return current;
  }

  /** Best effort — a cancelled prediction stops the meter. */
  private async cancel(cancelUrl: string): Promise<void> {
    await fetchJson(cancelUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.token}` },
      retries: 0,
    }).catch(() => {});
  }
}
