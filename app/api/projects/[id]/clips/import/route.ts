import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { toSceneView } from "@/lib/projects";
import { extractPoster, probeVideo } from "@/lib/providers/ffmpeg";
import { getStorage, projectPrefix, uploadPrefix } from "@/lib/storage";

const MAX_BYTES = 100 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

function safeFilename(original: string): string {
  const base = path.basename(original).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return (base || "clip.mp4").slice(0, 120);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await context.params;

  const limited = enforceRateLimit(`uploads:${user.id}`, RATE_LIMITS.uploads);
  if (limited) return limited;

  const project = await prisma.videoProject.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a video file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a video to import." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That video file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That clip is over the 100 MB import limit." },
      { status: 413 }
    );
  }

  const extension = path.extname(file.name).toLowerCase();
  const inferredMime = MIME_BY_EXTENSION[extension];
  const mime = file.type || inferredMime || "application/octet-stream";
  if (!mime.startsWith("video/") && !inferredMime) {
    return NextResponse.json(
      { error: "Import an MP4, MOV or WebM video." },
      { status: 415 }
    );
  }

  const storage = getStorage();
  const assetId = randomUUID();
  const storageKey = `${uploadPrefix(user.id, assetId)}/${safeFilename(file.name)}`;
  const posterKey = `${projectPrefix(id)}/imports/${assetId}.jpg`;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "lumen-import-"));
  const tempVideo = path.join(tempDir, "clip.mp4");
  const tempPoster = path.join(tempDir, "poster.jpg");
  let imageKey: string | null = null;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(tempVideo, bytes);

    const probe = await probeVideo(tempVideo);
    const duration = probe?.durationSeconds ?? 0;
    if (!probe || !Number.isFinite(duration) || duration <= 0) {
      return NextResponse.json(
        { error: "That video could not be read. Try an MP4, MOV or WebM file." },
        { status: 422 }
      );
    }

    try {
      await extractPoster(
        tempVideo,
        tempPoster,
        Math.min(Math.max(0.1, duration * 0.25), Math.max(0.1, duration - 0.1))
      );
      await storage.putFile(tempPoster, posterKey);
      imageKey = posterKey;
    } catch {
      imageKey = null;
    }

    await storage.putBuffer(bytes, storageKey);

    const baseTitle = path
      .basename(file.name, extension)
      .replace(/[_-]+/g, " ")
      .trim();
    const title = (baseTitle || "Imported clip").slice(0, 80);
    const measuredDuration = Math.round(duration * 100) / 100;

    const scene = await prisma.$transaction(async (tx) => {
      const aggregate = await tx.scene.aggregate({
        where: { projectId: id },
        _max: { index: true },
      });
      const index = (aggregate._max.index ?? -1) + 1;

      await tx.asset.create({
        data: {
          id: assetId,
          userId: user.id,
          projectId: id,
          kind: "source_video",
          editorOnly: true,
          storageKey,
          filename: file.name.slice(0, 200),
          mime: mime.startsWith("video/") ? mime : inferredMime ?? "video/mp4",
          size: bytes.length,
          width: probe.width,
          height: probe.height,
          durationSec: measuredDuration,
        },
      });

      const created = await tx.scene.create({
        data: {
          projectId: id,
          index,
          title,
          durationSec: Math.max(1, Math.ceil(measuredDuration)),
          visualPrompt: `Local clip imported from ${file.name}.`,
          status: "clip_ready",
          clipKey: storageKey,
          imageKey,
          editorOnly: true,
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        scene: {
          ...toSceneView(scene),
          clipDurationSec: measuredDuration,
        },
      },
      { status: 201 }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
