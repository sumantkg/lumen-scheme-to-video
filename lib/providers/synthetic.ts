import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ASPECT_DIMENSIONS, clampDurationSeconds } from "./dimensions";
import { runFfmpeg } from "./ffmpeg";
import type { AspectRatio } from "./types";

/**
 * Offline source-clip renderer for the provider test harness.
 *
 * The deleted "mock" provider used to paint the clip the fake APIs serve to
 * the real providers under test. This is that job, minus the provider: a tiny
 * ffmpeg-only helper that produces a real H.264/AAC clip, used exclusively by
 * scripts/provider-test.ts. It is not a provider — there is no "mock" path in
 * the product anymore.
 */
export interface SyntheticClip {
  videoPath: string;
  width: number;
  height: number;
  durationSeconds: number;
  cleanup(): Promise<void>;
}

export async function renderSyntheticClip(input: {
  aspect: AspectRatio;
  durationSeconds: number;
}): Promise<SyntheticClip> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lumen-syn-"));
  const videoPath = path.join(dir, "clip.mp4");
  const { width, height } = ASPECT_DIMENSIONS[input.aspect];
  const duration = clampDurationSeconds(input.durationSeconds);

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${width}x${height}:rate=24`,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    videoPath,
  ]);

  return {
    videoPath,
    width,
    height,
    durationSeconds: duration,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}