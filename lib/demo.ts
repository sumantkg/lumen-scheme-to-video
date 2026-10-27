import "server-only";

import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { prisma } from "@/lib/db";
import { extractPoster, runFfmpeg } from "@/lib/providers/ffmpeg";
import { getStorage, projectPrefix } from "@/lib/storage";

const DEMO_TITLE = "Lumen Editor Demo";
const WIDTH = 1280;
const HEIGHT = 720;
const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "C:\\Windows\\Fonts\\arial.ttf",
];

interface DemoSceneSpec {
  title: string;
  kicker: string;
  visualPrompt: string;
  cameraAngle: string;
  voiceoverText: string;
  durationSec: number;
  palette: [string, string];
  gradientType: "linear" | "radial" | "circular" | "spiral";
  seed: number;
}

const DEMO_SCENES: DemoSceneSpec[] = [
  {
    title: "The Promise",
    kicker: "OPENING SHOT",
    visualPrompt:
      "A cinematic opening title card with a slow violet aurora drifting across a dark sky.",
    cameraAngle: "Slow push in",
    voiceoverText:
      "Every student deserves a clear path from ambition to opportunity.",
    durationSec: 7,
    palette: ["0x090713", "0x6d28d9"],
    gradientType: "radial",
    seed: 11,
  },
  {
    title: "Learn The Basics",
    kicker: "THE SCHEME",
    visualPrompt:
      "An informative title card with cool cyan light sweeping across a deep blue background.",
    cameraAngle: "Locked off",
    voiceoverText:
      "The scheme brings together guidance, training and financial support in one place.",
    durationSec: 6,
    palette: ["0x06131a", "0x0891b2"],
    gradientType: "linear",
    seed: 23,
  },
  {
    title: "Apply In Minutes",
    kicker: "HOW TO APPLY",
    visualPrompt:
      "A warm amber title card with a subtle rotating glow and clear editorial typography.",
    cameraAngle: "Slow orbit",
    voiceoverText:
      "Check your eligibility, keep your documents ready and submit the application online.",
    durationSec: 7,
    palette: ["0x1a1006", "0xd97706"],
    gradientType: "spiral",
    seed: 37,
  },
  {
    title: "Your Future Starts Now",
    kicker: "CLOSING",
    visualPrompt:
      "A closing title card with a rose and magenta gradient and a gentle camera drift.",
    cameraAngle: "Slow pull back",
    voiceoverText:
      "A brighter future is closer than you think. Start your application today.",
    durationSec: 6,
    palette: ["0x190711", "0xdb2777"],
    gradientType: "radial",
    seed: 41,
  },
];

function resolveFont(): string | null {
  return FONT_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,");
}

function drawtext(
  font: string,
  text: string,
  options: {
    fontSize: number;
    color: string;
    x: string;
    y: string;
  }
): string {
  return `drawtext=${[
    `fontfile='${escapeDrawtext(font)}'`,
    `text='${escapeDrawtext(text)}'`,
    `fontsize=${options.fontSize}`,
    `fontcolor=${options.color}`,
    `x=${options.x}`,
    `y=${options.y}`,
  ].join(":")}`;
}

async function renderDemoClip(
  spec: DemoSceneSpec,
  index: number,
  dir: string
): Promise<{ videoPath: string; posterPath: string }> {
  const videoPath = path.join(dir, `scene-${index + 1}.mp4`);
  const posterPath = path.join(dir, `scene-${index + 1}.jpg`);
  const font = resolveFont();
  const filters: string[] = [];

  if (font) {
    filters.push(
      drawtext(font, String(index + 1).padStart(2, "0"), {
        fontSize: 280,
        color: "white@0.14",
        x: "76",
        y: "(h-text_h)/2-30",
      }),
      drawtext(font, spec.kicker, {
        fontSize: 22,
        color: "white@0.68",
        x: "84",
        y: "88",
      }),
      drawtext(font, spec.title, {
        fontSize: 52,
        color: "white@0.95",
        x: "84",
        y: "h-160",
      }),
      drawtext(font, DEMO_TITLE, {
        fontSize: 18,
        color: "white@0.5",
        x: "84",
        y: "h-92",
      })
    );
  }

  filters.push(
    "drawbox=x=48:y=48:w=iw-96:h=ih-96:color=white@0.16:t=1",
    "format=yuv420p"
  );

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `gradients=size=${WIDTH}x${HEIGHT}:rate=30:c0=${spec.palette[0]}:c1=${spec.palette[1]}:x0=0:y0=0:x1=${WIDTH}:y1=${HEIGHT}:speed=0.012:type=${spec.gradientType}:duration=${spec.durationSec}:seed=${spec.seed}`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(spec.durationSec),
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    "-movflags",
    "+faststart",
    videoPath,
  ];
  await runFfmpeg(args);

  await extractPoster(
    videoPath,
    posterPath,
    Math.min(1.5, Math.max(0.1, spec.durationSec * 0.35))
  );

  return { videoPath, posterPath };
}

async function deleteDemoProject(projectId: string): Promise<void> {
  const storage = getStorage();
  const assets = await prisma.asset.findMany({
    where: { projectId },
    select: { id: true, storageKey: true },
  });

  if (assets.length > 0) {
    await prisma.asset.deleteMany({
      where: { id: { in: assets.map((asset) => asset.id) } },
    });
  }
  await prisma.videoProject.delete({ where: { id: projectId } });
  await storage.removePrefix(projectPrefix(projectId));
  await Promise.allSettled(
    assets.map((asset) => storage.remove(asset.storageKey))
  );
}

async function createDemoProject(userId: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lumen-demo-"));
  try {
    const rendered: Array<{ videoPath: string; posterPath: string }> = [];
    for (let index = 0; index < DEMO_SCENES.length; index++) {
      try {
        rendered.push(await renderDemoClip(DEMO_SCENES[index], index, dir));
      } catch (error) {
        throw new Error(
          `Demo clip ${index + 1} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const totalDuration = DEMO_SCENES.reduce(
      (sum, scene) => sum + scene.durationSec,
      0
    );
    const project = await prisma.videoProject.create({
      data: {
        userId,
        isDemo: true,
        title: DEMO_TITLE,
        status: "scenes_ready",
        stage: "Demo clips ready",
        progress: 90,
        sceneCount: DEMO_SCENES.length,
        language: "en",
        region: "India",
        tone: "Cinematic",
        targetDurationSec: totalDuration,
        aspect: "16:9",
        schemeTitle: DEMO_TITLE,
        notes:
          "Local editor demo. Clips are generated with ffmpeg and do not use any AI video provider.",
        llmProvider: "gemini",
        videoProvider: "gemini",
        useCritic: false,
      },
    });

    const storage = getStorage();
    const prefix = projectPrefix(project.id);

    try {
      for (let index = 0; index < rendered.length; index++) {
        const clip = rendered[index];
        const number = index + 1;
        await storage.putFile(clip.videoPath, `${prefix}/scene-${number}.mp4`);
        await storage.putFile(clip.posterPath, `${prefix}/scene-${number}.jpg`);
      }

      await prisma.$transaction(
        DEMO_SCENES.map((scene, index) =>
          prisma.scene.create({
            data: {
              projectId: project.id,
              index: index + 1,
              title: scene.title,
              durationSec: scene.durationSec,
              visualPrompt: scene.visualPrompt,
              cameraAngle: scene.cameraAngle,
              voiceoverText: scene.voiceoverText,
              narrationStartSec: 0.5,
              narrationEndSec: Math.max(1, scene.durationSec - 1),
              onscreenText: JSON.stringify([scene.kicker, scene.title]),
              groundingElements: JSON.stringify(["Lumen editor demo"]),
              noLipSyncNote: "Demo clip generated locally",
              status: "clip_ready",
              clipKey: `${prefix}/scene-${index + 1}.mp4`,
              imageKey: `${prefix}/scene-${index + 1}.jpg`,
            },
          })
        )
      );
    } catch (error) {
      await prisma.videoProject.delete({ where: { id: project.id } }).catch(() => {});
      await storage.removePrefix(prefix).catch(() => {});
      throw error;
    }

    return project.id;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function ensureDemoProject(
  userId: string
): Promise<{ projectId: string; created: boolean }> {
  const existing = await prisma.videoProject.findFirst({
    where: { userId, isDemo: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const storage = getStorage();
    const scenes = await prisma.scene.findMany({
      where: { projectId: existing.id, editorOnly: false },
      select: { clipKey: true },
    });
    let valid = scenes.length === DEMO_SCENES.length;
    if (valid) {
      for (const scene of scenes) {
        if (!scene.clipKey || !(await storage.exists(scene.clipKey))) {
          valid = false;
          break;
        }
      }
    }
    if (valid) return { projectId: existing.id, created: false };
    await deleteDemoProject(existing.id);
  }

  return { projectId: await createDemoProject(userId), created: true };
}

export async function resetDemoProject(userId: string): Promise<string> {
  const existing = await prisma.videoProject.findFirst({
    where: { userId, isDemo: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) await deleteDemoProject(existing.id);
  return createDemoProject(userId);
}
