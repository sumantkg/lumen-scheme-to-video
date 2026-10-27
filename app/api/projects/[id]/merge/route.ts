import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { getStorage, projectPrefix } from "@/lib/storage";
import {
  trimVideo,
  stitchClipsWithTransitionsAndMusic,
  extractPoster,
  probeVideo,
} from "@/lib/providers/ffmpeg";

interface MergeSequenceItem {
  sceneId: string;
  trimStartSec?: number;
  trimEndSec?: number;
  transition?: string; // "none" | "fade" | "fadeblack" | "wipeleft" | "slideleft" | "circlecrop"
  transitionDurationSec?: number;
}

interface MergeRequestBody {
  sceneIds?: unknown;
  items?: MergeSequenceItem[];
  backgroundMusic?: string; // "none" | "uplifting" | "calm" | "cinematic"
  bgmVolume?: number; // 0.0 - 1.0
}

/**
 * Merge an ordered list of scene clips into one final MP4, with optional
 * per-clip trimming, scene transitions, and background music.
 *
 *   POST /api/projects/[id]/merge
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;
  const signal = request.signal;

  const limited = enforceRateLimit(`merge:${user.id}`, RATE_LIMITS.merge);
  if (limited) return limited;

  const project = await prisma.videoProject.findFirst({
    where: { id, userId: user.id },
    select: { id: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let body: MergeRequestBody = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  // Support both new `items` format and backward-compatible `sceneIds`
  let items: MergeSequenceItem[] = [];
  if (Array.isArray(body.items) && body.items.length > 0) {
    items = body.items.filter((item) => item && typeof item.sceneId === "string");
  } else if (Array.isArray(body.sceneIds) && body.sceneIds.length > 0) {
    items = body.sceneIds
      .filter((s): s is string => typeof s === "string")
      .map((sceneId) => ({ sceneId }));
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one scene clip to assemble." },
      { status: 422 }
    );
  }

  const sceneIds = items.map((i) => i.sceneId);

  // Resolve scenes from DB
  const scenes = await prisma.scene.findMany({
    where: { projectId: id, id: { in: sceneIds } },
    select: { id: true, index: true, clipKey: true, durationSec: true },
  });

  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const storage = getStorage();

  // Validate all requested scenes have clips
  for (const item of items) {
    const scene = sceneMap.get(item.sceneId);
    if (!scene || !scene.clipKey) {
      return NextResponse.json(
        { error: `Scene ${item.sceneId} does not have a generated clip yet.` },
        { status: 422 }
      );
    }
    const exists = await storage.exists(scene.clipKey);
    if (!exists) {
      return NextResponse.json(
        { error: `Clip file for Scene #${scene.index} is missing from storage.` },
        { status: 422 }
      );
    }
  }

  // Resolve Background Music track if requested
  let bgmPath: string | null = null;
  const bgmChoice = typeof body.backgroundMusic === "string" ? body.backgroundMusic : "none";
  if (bgmChoice !== "none") {
    const potentialPath = path.resolve(`./app/audio/${bgmChoice}.mp3`);
    if (existsSync(potentialPath)) {
      bgmPath = potentialPath;
    }
  }
  const bgmVolume = typeof body.bgmVolume === "number" ? Math.max(0, Math.min(1, body.bgmVolume)) : 0.2;

  // Work in a temp dir
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "lumen-merge-"));
  try {
    const preparedClips: Array<{ path: string; durationSec: number }> = [];

    // Process each clip in order (applying trim if needed)
    for (let i = 0; i < items.length; i++) {
      signal.throwIfAborted();
      const item = items[i];
      const scene = sceneMap.get(item.sceneId)!;
      const originalPath = storage.localPath(scene.clipKey!);
      const probe = await probeVideo(originalPath);
      const sourceDuration = probe?.durationSeconds ?? scene.durationSec;

      // Trim against the real media length. `scene.durationSec` is the planned
      // script duration, which can differ from what the provider rendered.
      const requestedStart = Math.max(0, item.trimStartSec ?? 0);
      const requestedEnd = Math.min(
        sourceDuration,
        item.trimEndSec ?? sourceDuration
      );
      const start = Math.min(requestedStart, Math.max(0, sourceDuration - 0.1));
      const end = Math.min(
        sourceDuration,
        Math.max(start + 0.1, requestedEnd)
      );
      const hasTrim = start > 0.05 || end < sourceDuration - 0.05;

      if (hasTrim) {
        const trimmedPath = path.join(tmpDir, `trimmed-slot-${i}.mp4`);

        await trimVideo(originalPath, trimmedPath, start, end, signal);
        const trimmedProbe = await probeVideo(trimmedPath);
        preparedClips.push({
          path: trimmedPath,
          durationSec: trimmedProbe?.durationSeconds ?? Math.max(0.5, end - start),
        });
      } else {
        preparedClips.push({
          path: originalPath,
          durationSec: sourceDuration,
        });
      }
    }

    // Prepare transitions
    const transitions = items.slice(0, items.length - 1).map((item) => ({
      type: item.transition ?? "none",
      durationSec: item.transitionDurationSec ?? 0.75,
    }));

    const mergedPath = path.join(tmpDir, "master-merged.mp4");
    const posterPath = path.join(tmpDir, "poster.jpg");

    await stitchClipsWithTransitionsAndMusic({
      clips: preparedClips,
      transitions,
      bgmPath,
      bgmVolume,
      destPath: mergedPath,
      signal,
    });

    await extractPoster(mergedPath, posterPath, 0, signal);
    signal.throwIfAborted();

    const prefix = projectPrefix(id);
    const finalKey = `${prefix}/final.mp4`;
    const thumbKey = `${prefix}/poster.jpg`;

    await storage.putFile(mergedPath, finalKey);
    signal.throwIfAborted();
    await storage.putFile(posterPath, thumbKey);
    signal.throwIfAborted();
    const editorKey = `${prefix}/editor.json`;
    await storage.putBuffer(Buffer.from(JSON.stringify(body), "utf-8"), editorKey);
    signal.throwIfAborted();

    const probe = await probeVideo(storage.localPath(finalKey));

    await prisma.videoProject.update({
      where: { id },
      data: {
        finalOutputKey: finalKey,
        finalThumbKey: thumbKey,
        finalDurationSec: probe?.durationSeconds ?? null,
        status: "ready",
        stage: "Final video ready",
        progress: 100,
        error: null,
      },
    });

    return NextResponse.json({
      success: true,
      finalUrl: `/api/projects/${id}/video?t=${Date.now()}`,
      durationSec: probe?.durationSeconds ?? null,
    });
  } catch (error) {
    if (signal.aborted) {
      return NextResponse.json({ error: "Render cancelled." }, { status: 499 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Merge failed: ${message}` }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
