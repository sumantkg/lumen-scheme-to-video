/**
 * The seam between Lumen and whatever actually generates video.
 *
 * Everything above this interface (queue, worker, storage, credits) is
 * provider-agnostic. A remote provider (Replicate, fal, Luma) implements the
 * same `render` contract, doing its own submit-and-poll internally and
 * reporting progress through the callback.
 */

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export function isAspectRatio(value: string): value is AspectRatio {
  return (ASPECT_RATIOS as readonly string[]).includes(value);
}

export interface ProviderRenderInput {
  jobId: string;
  prompt: string;
  aspect: AspectRatio;
  durationSeconds: number;
  style?: string | null;
  seed?: number;
  /**
   * Optional local paths to reference media (a first frame, an image-to-video
   * source, a style reference). Hosted providers that accept conditioning
   * read these; others ignore the field. Populated per-scene from the
   * project's uploaded grounding / reference assets.
   */
  references?: string[];
}

export interface ProviderRenderOutput {
  /** Absolute path to the rendered video on the local disk. */
  videoPath: string;
  /** Absolute path to a poster frame, when the provider produced one. */
  thumbPath?: string;
  width: number;
  height: number;
  durationSeconds: number;
  providerJobId?: string;
  /** Remove any temporary files the provider created. */
  cleanup?: () => Promise<void>;
}

export type ProgressCallback = (progress: number) => void | Promise<void>;

export interface VideoProvider {
  readonly name: string;
  render(
    input: ProviderRenderInput,
    onProgress: ProgressCallback
  ): Promise<ProviderRenderOutput>;
}
