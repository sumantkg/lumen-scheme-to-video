import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegBinary from "ffmpeg-static";

import type { ProgressCallback } from "./types";

/**
 * Thin wrapper around the ffmpeg binary bundled by `ffmpeg-static`.
 *
 * Shared by every provider: the mock paints frames from scratch, remote
 * providers use it to trim/crop/re-encode model output and grab a poster. No
 * provider talks to ffmpeg directly.
 */

export const FFMPEG = ffmpegBinary as unknown as string;

export function requireFfmpeg(): string {
  if (!FFMPEG || !existsSync(FFMPEG)) {
    throw new Error(
      "ffmpeg binary is missing. Run `pnpm install` so ffmpeg-static can download it."
    );
  }
  return FFMPEG;
}

export interface RunFfmpegOptions {
  /** Output duration, used to turn `out_time_ms` into a percentage. */
  durationSec?: number;
  onProgress?: ProgressCallback;
  /** Abort the underlying process when the request is abandoned. */
  signal?: AbortSignal;
}

function abortError(): Error {
  return new DOMException("The render was cancelled.", "AbortError");
}

/** Run an ffmpeg command, streaming `-progress` output into a callback. */
export function runFfmpeg(args: string[], options: RunFfmpegOptions = {}): Promise<void> {
  const binary = requireFfmpeg();
  if (options.signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    let highestPercent = 0;
    let settled = false;
    let aborted = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => {
      aborted = true;
      child.kill("SIGKILL");
      finish(() => reject(abortError()));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    child.stdout.on("data", (chunk: Buffer) => {
      for (const rawLine of chunk.toString().split("\n")) {
        // `out_time_ms` is in microseconds despite its name.
        const match = /^out_time_ms=(\d+)/.exec(rawLine.trim());
        if (!match || !options.onProgress || !options.durationSec) continue;

        const seconds = Number(match[1]) / 1_000_000;
        const percent = Math.round((seconds / options.durationSec) * 100);
        if (percent > highestPercent && percent <= 99) {
          highestPercent = percent;
          void options.onProgress(percent);
        }
      }
    });

    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      if (aborted) {
        finish(() => reject(abortError()));
      } else if (code === 0) {
        finish(() => resolve());
      } else {
        finish(() =>
          reject(
            new Error(
              `ffmpeg exited with code ${code}. ${stderr.trim().split("\n").slice(-3).join(" ")}`
            )
          )
        );
      }
    });
  });
}

export interface VideoProbe {
  width: number;
  height: number;
  durationSeconds: number | null;
  hasAudio: boolean;
}

/**
 * Read stream geometry out of a file's header.
 *
 * `ffmpeg -i` is the only introspection tool bundled by ffmpeg-static (no
 * ffprobe), so we parse the banner it prints to stderr. The exit code is
 * meaningless here — ffmpeg always fails because no output was requested.
 */
export async function probeVideo(file: string): Promise<VideoProbe | null> {
  const binary = requireFfmpeg();

  const stderr = await new Promise<string>((resolve) => {
    const child = spawn(binary, ["-hide_banner", "-i", file], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let buffer = "";
    child.stderr.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
    });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(buffer));
  });

  const videoAt = stderr.indexOf("Video:");
  if (videoAt === -1) return null;

  // Resolution lives on the video stream line, which ffmpeg may wrap — look a
  // little past the marker. The `0x…` codec tags on the same line can't match
  // because they are not preceded by two digits.
  const dimensions = /(\d{2,5})x(\d{2,5})/.exec(stderr.slice(videoAt, videoAt + 400));
  if (!dimensions) return null;

  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);

  return {
    width: Number(dimensions[1]),
    height: Number(dimensions[2]),
    durationSeconds: duration
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : null,
    hasAudio: /Stream #\d+:\d+.*?: Audio:/.test(stderr),
  };
}

/** Grab a single frame as a JPEG poster. */
export async function extractPoster(
  videoPath: string,
  thumbPath: string,
  atSeconds: number,
  signal?: AbortSignal
): Promise<void> {
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(Math.max(0, atSeconds)),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    thumbPath,
  ], { signal });
}

export interface NormalizeOptions {
  width: number;
  height: number;
  durationSeconds: number;
  hasAudio: boolean;
  onProgress?: ProgressCallback;
}

/**
 * Re-encode arbitrary footage into Lumen's delivery format.
 *
 * - **aspect** — scale to cover, then centre-crop, so nothing is letterboxed.
 * - **duration** — the input is looped and cut to the exact requested length,
 *   so a 4s model clip still honours a 10s request.
 * - **compatibility** — H.264 / yuv420p / constant frame rate / `+faststart`,
 *   which is what makes the file stream and seek in every browser.
 */
export async function normalizeVideo(
  sourcePath: string,
  destPath: string,
  options: NormalizeOptions
): Promise<void> {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostats",
    // Loop the source so a short clip can fill a longer request.
    "-stream_loop",
    "-1",
    "-i",
    sourcePath,
    "-t",
    String(options.durationSeconds),
    "-vf",
    `scale=${options.width}:${options.height}:force_original_aspect_ratio=increase,` +
      `crop=${options.width}:${options.height},format=yuv420p,setsar=1`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-fps_mode",
    "cfr",
  ];

  if (options.hasAudio) {
    args.push("-c:a", "aac", "-b:a", "128k");
  } else {
    args.push("-an");
  }

  args.push("-movflags", "+faststart", "-progress", "pipe:1", destPath);

  await runFfmpeg(args, {
    durationSec: options.durationSeconds,
    onProgress: options.onProgress,
  });
}

/**
 * Concatenate pre-normalised scene clips into one video.
 *
 * Every clip has already passed through `normalizeVideo`, so codec, resolution
 * and rate match. Scene 3's merge step relies on that contract: clips are
 * stitched with the concat demuxer (fast, stream-copied) and given fresh,
 * monotonically increasing timestamps.
 *
 * Audio is treated as optional per scene — any missing narration is replaced
 * with silence during assembly so the final file always has an audio track.
 */
export async function concatVideos(
  clipPaths: string[],
  destPath: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("concatVideos: no clips to merge.");
  if (clipPaths.length === 1) {
    await runFfmpeg(
      ["-y", "-hide_banner", "-loglevel", "error", "-i", clipPaths[0], "-c", "copy", destPath],
      { signal }
    );
    return;
  }

  const listPath = `${destPath}.txt`;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    listPath,
    clipPaths.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n") + "\n"
  );

  await runFfmpeg(
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-fflags",
      "+genpts",
      "-movflags",
      "+faststart",
      destPath,
    ],
    { durationSec: clipPaths.length * 10, onProgress, signal }
  );

  await rmSilently(listPath);
}

/**
 * Layer a narration/AI-voiceover track over a (usually merged) video.
 *
 * The narration is treated as the primary audio; the source video's own track,
 * if any, is dropped in favour of it to keep the voiceover loud and clear.
 * `-shortest` stops the file at the shorter of the two inputs.
 */
export async function muxAudio(
  videoPath: string,
  audioPath: string,
  destPath: string,
  onProgress?: ProgressCallback
): Promise<void> {
  await runFfmpeg(
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      destPath,
    ],
    { onProgress }
  );
}

/**
 * Trim a video clip to an in-point (startSec) and out-point (endSec).
 */
export async function trimVideo(
  sourcePath: string,
  destPath: string,
  startSec: number,
  endSec: number,
  signal?: AbortSignal
): Promise<void> {
  const safeStart = Math.max(0, startSec);
  const safeDuration = Math.max(0.5, endSec - safeStart);

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(safeStart),
    "-t",
    String(safeDuration),
    "-i",
    sourcePath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    destPath,
  ], { signal });
}

export interface TransitionOption {
  type: string; // "none" | "fade" | "fadeblack" | "wipeleft" | "slideleft" | "circlecrop"
  durationSec: number;
}

export interface StitchOptions {
  clips: Array<{
    path: string;
    durationSec: number;
  }>;
  transitions?: TransitionOption[];
  bgmPath?: string | null;
  bgmVolume?: number;
  destPath: string;
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

/**
 * Stitch multiple clips with optional scene transitions and background music.
 *
 * If all transitions are "none" and no background music is selected, falls back
 * directly to lossless stream-copy concat.
 */
export async function stitchClipsWithTransitionsAndMusic(
  options: StitchOptions
): Promise<void> {
  const {
    clips,
    transitions = [],
    bgmPath,
    bgmVolume = 0.2,
    destPath,
    onProgress,
    signal,
  } = options;

  if (clips.length === 0) throw new Error("stitchClips: no clips provided.");

  // Single clip with no BGM
  if (clips.length === 1 && !bgmPath) {
    await runFfmpeg(
      ["-y", "-hide_banner", "-loglevel", "error", "-i", clips[0].path, "-c", "copy", destPath],
      { signal }
    );
    return;
  }

  const hasTransitions = transitions.some((t) => t && t.type !== "none" && t.durationSec > 0);

  // If no transitions and no BGM, use stream-copy concat
  if (!hasTransitions && !bgmPath) {
    await concatVideos(
      clips.map((c) => c.path),
      destPath,
      onProgress,
      signal
    );
    return;
  }

  // If no transitions but BGM is selected, concat first then mux BGM
  if (!hasTransitions && bgmPath) {
    const tmpConcat = `${destPath}.tmp-concat.mp4`;
    await concatVideos(
      clips.map((c) => c.path),
      tmpConcat,
      onProgress,
      signal
    );

    await mixBackgroundMusic(tmpConcat, bgmPath, bgmVolume, destPath, signal);
    await rmSilently(tmpConcat);
    return;
  }

  const inputs: string[] = [];
  clips.forEach((c) => {
    inputs.push("-i", c.path);
  });

  const filterParts: string[] = [];
  const runs: Array<{ clipIndices: number[]; transitions: TransitionOption[] }> = [];
  let activeRun: { clipIndices: number[]; transitions: TransitionOption[] } = {
    clipIndices: [0],
    transitions: [],
  };

  for (let i = 1; i < clips.length; i++) {
    const trans = transitions[i - 1];
    if (!trans || trans.type === "none" || trans.durationSec <= 0) {
      runs.push(activeRun);
      activeRun = { clipIndices: [i], transitions: [] };
    } else {
      activeRun.clipIndices.push(i);
      activeRun.transitions.push(trans);
    }
  }
  runs.push(activeRun);

  let totalOutputDuration = 0;
  const runVideoOut: string[] = [];
  const runAudioOut: string[] = [];

  runs.forEach((run, runIndex) => {
    const firstIndex = run.clipIndices[0];
    let videoLabel: string;
    let audioLabel: string;

    if (run.clipIndices.length === 1) {
      videoLabel = `rv${runIndex}f`;
      audioLabel = `ra${runIndex}f`;
      filterParts.push(
        `[${firstIndex}:v]format=yuv420p,setsar=1,setpts=PTS-STARTPTS[${videoLabel}]`,
        `[${firstIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[${audioLabel}]`
      );
      totalOutputDuration += clips[firstIndex].durationSec;
    } else {
      let vPrev = `${firstIndex}:v`;
      let aPrev = `${firstIndex}:a`;
      let currentOffset = clips[firstIndex].durationSec;

      for (let j = 1; j < run.clipIndices.length; j++) {
        const clipIndex = run.clipIndices[j];
        const trans = run.transitions[j - 1];
        const tDuration = Math.min(
          trans.durationSec,
          1.5,
          clips[run.clipIndices[j - 1]].durationSec / 2,
          clips[clipIndex].durationSec / 2
        );
        const offset = Math.max(0.1, currentOffset - tDuration);
        const vNext = j === run.clipIndices.length - 1 ? `rv${runIndex}raw` : `rv${runIndex}m${j}`;
        const aNext = j === run.clipIndices.length - 1 ? `ra${runIndex}raw` : `ra${runIndex}m${j}`;

        filterParts.push(
          `[${vPrev}][${clipIndex}:v]xfade=transition=${trans.type}:duration=${tDuration}:offset=${offset}[${vNext}]`,
          `[${aPrev}][${clipIndex}:a]acrossfade=d=${tDuration}[${aNext}]`
        );

        vPrev = vNext;
        aPrev = aNext;
        currentOffset = offset + clips[clipIndex].durationSec;
      }

      videoLabel = `rv${runIndex}f`;
      audioLabel = `ra${runIndex}f`;
      filterParts.push(
        `[${vPrev}]format=yuv420p,setsar=1,setpts=PTS-STARTPTS[${videoLabel}]`,
        `[${aPrev}]aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[${audioLabel}]`
      );
      totalOutputDuration += currentOffset;
    }

    runVideoOut.push(`[${videoLabel}]`);
    runAudioOut.push(`[${audioLabel}]`);
  });

  let finalVideo: string;
  let finalAudio: string;

  if (runs.length === 1) {
    finalVideo = runVideoOut[0];
    finalAudio = runAudioOut[0];
  } else {
    const concatInputs = runVideoOut
      .map((video, index) => `${video}${runAudioOut[index]}`)
      .join("");
    filterParts.push(
      `${concatInputs}concat=n=${runs.length}:v=1:a=1[vout][aout]`
    );
    finalVideo = "[vout]";
    finalAudio = "[aout]";
  }

  const filterComplex = filterParts.join(";");
  const tmpStitched = bgmPath ? `${destPath}.tmp-stitch.mp4` : destPath;

  await runFfmpeg(
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...inputs,
      "-filter_complex",
      filterComplex,
      "-map",
      finalVideo,
      "-map",
      finalAudio,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "21",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      tmpStitched,
    ],
    { durationSec: totalOutputDuration, onProgress, signal }
  );

  if (bgmPath) {
    await mixBackgroundMusic(tmpStitched, bgmPath, bgmVolume, destPath, signal);
    await rmSilently(tmpStitched);
  }
}

/**
 * Mix a background music track into an existing video's audio.
 */
async function mixBackgroundMusic(
  videoPath: string,
  bgmPath: string,
  bgmVolume: number,
  destPath: string,
  signal?: AbortSignal
): Promise<void> {
  const safeVolume = Math.max(0.01, Math.min(1.0, bgmVolume));
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-stream_loop",
    "-1",
    "-i",
    bgmPath,
    "-filter_complex",
    `[0:a]volume=1.0[a0];[1:a]volume=${safeVolume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    "-movflags",
    "+faststart",
    destPath,
  ], { signal });
}

async function rmSilently(target: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(target, { force: true }).catch(() => {});
}

