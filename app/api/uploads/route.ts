import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/http";
import { probeVideo } from "@/lib/providers/ffmpeg";
import { toAssetView } from "@/lib/projects";
import { getStorage, uploadPrefix } from "@/lib/storage";

/**
 * File uploads for a project: scheme documents, grounding photos, reference
 * images and source videos. Files are stored under the user's upload prefix and
 * referenced by the database; nothing is ever re-written from user-supplied
 * filenames.
 */

const MAX_BYTES = 25 * 1024 * 1024;

const KIND_MIME: Record<string, string[]> = {
  document: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown"],
  grounding_image: ["image/jpeg", "image/png", "image/webp"],
  reference_image: ["image/jpeg", "image/png", "image/webp"],
  source_video: ["video/mp4", "video/webm", "video/quicktime"],
};

export const ALLOWED_UPLOAD_KINDS = Object.keys(KIND_MIME);

function safeFilename(original: string): string {
  const base = path.basename(original).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return (base || "upload").slice(0, 120);
}

export async function POST(request: Request) {
  const user = await requireUser();

  const limited = enforceRateLimit(`uploads:${user.id}`, RATE_LIMITS.uploads);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file." }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "document");
  if (!KIND_MIME[kind]) {
    return NextResponse.json(
      { error: `Unknown upload kind "${kind}".` },
      { status: 400 }
    );
  }

  const projectId = form.get("projectId")?.toString() || null;
  if (projectId) {
    const owner = await prisma.videoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
  }

  const mime = file.type || "application/octet-stream";
  const allowed = KIND_MIME[kind];
  if (!allowed.includes(mime)) {
    return NextResponse.json(
      {
        error: `"${file.name}" is a ${mime} file — this field accepts ${allowed.join(", ")}.`,
      },
      { status: 415 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is over the 25 MB upload limit." },
      { status: 413 }
    );
  }

  const id = randomUUID();
  const storageKey = `${uploadPrefix(user.id, id)}/${safeFilename(file.name)}`;
  await getStorage().putBuffer(bytes, storageKey);

  let width: number | null = null;
  let height: number | null = null;
  let durationSec: number | null = null;

  if (kind === "source_video" || mime.startsWith("video/")) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "lumen-upload-"));
    const tempPath = path.join(tempDir, "upload.mp4");
    try {
      await writeFile(tempPath, bytes);
      const probe = await probeVideo(tempPath);
      if (probe) {
        width = probe.width;
        height = probe.height;
        durationSec = probe.durationSeconds;
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  const asset = await prisma.asset.create({
    data: {
      userId: user.id,
      projectId,
      kind,
      storageKey,
      filename: file.name.slice(0, 200),
      mime,
      size: bytes.length,
      width,
      height,
      durationSec,
    },
  });

  return NextResponse.json({ asset: toAssetView(asset) }, { status: 201 });
}