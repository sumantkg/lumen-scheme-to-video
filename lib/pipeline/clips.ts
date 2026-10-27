import { getDecryptedKey, hasCredential } from "@/lib/credentials";
import { prisma } from "@/lib/db";
import { isProviderName, type ProviderName } from "@/lib/providers";
import { FalProvider, falConfig } from "@/lib/providers/fal";
import { GeminiProvider, geminiConfig } from "@/lib/providers/gemini";
import { ReplicateProvider, replicateConfig } from "@/lib/providers/replicate";
import type { VideoProvider } from "@/lib/providers/types";
import { getStorage } from "@/lib/storage";
import { parseStringArray } from "./serialize";

/**
 * Phase 2 — turning a storyboard scene into a video clip.
 *
 * Per-user key resolution lives here: a project names a provider, and the key
 * is read from the user's encrypted vault first, then the operator's env. There
 * is deliberately no mock path — a clip is only ever rendered by a real,
 * verified account.
 */

export interface ResolvedClipProvider {
  name: ProviderName;
  provider: VideoProvider;
}

/**
 * Resolve the video provider for a project.
 *
 * Gemini (Omni) reuses the user's verified Gemini key — the same Google key that
 * already powers the storyboard. Replicate and fal read their own vault entry,
 * falling back to the operator's env token.
 */
export async function resolveClipProvider(params: {
  userId: string;
  videoProvider: string;
  videoModel: string | null;
}): Promise<ResolvedClipProvider> {
  const name: ProviderName = isProviderName(params.videoProvider)
    ? params.videoProvider
    : "gemini";
  const model = params.videoModel?.trim() || null;

  switch (name) {
    case "gemini": {
      const apiKey = await getDecryptedKey(params.userId, "gemini");
      return {
        name,
        provider: new GeminiProvider(geminiConfig({ apiKey: apiKey ?? undefined, model })),
      };
    }
    case "replicate": {
      const token = await getDecryptedKey(params.userId, "replicate");
      return {
        name,
        provider: new ReplicateProvider(replicateConfig({ token: token ?? undefined, model })),
      };
    }
    case "fal": {
      const key = await getDecryptedKey(params.userId, "fal");
      return { name, provider: new FalProvider(falConfig({ key: key ?? undefined, model })) };
    }
  }
}

interface PromptScene {
  visualPrompt: string;
  cameraAngle: string | null;
  onscreenText: string | null;
  groundingElements: string | null;
  noLipSyncNote: string | null;
}

/**
 * Assemble the text-to-video prompt for one scene.
 *
 * The storyboard's `visualPrompt` carries the shot; the structured fields
 * (camera, on-screen text, grounding, the no-lip-sync note) are appended so a
 * provider that only reads `prompt` still receives the full direction.
 */
export function buildSceneClipPrompt(
  scene: PromptScene,
  project: { region: string | null; aspect?: string | null }
): string {
  const parts: string[] = [scene.visualPrompt.trim()];

  const camera = scene.cameraAngle?.trim();
  if (camera) parts.push(`Camera: ${camera}.`);

  const onscreen = parseStringArray(scene.onscreenText);
  if (onscreen.length > 0) {
    parts.push(`On-screen text to display: ${onscreen.join(" · ")}.`);
  }

  const grounding = parseStringArray(scene.groundingElements);
  if (grounding.length > 0) {
    parts.push(`Recognisable local details: ${grounding.join(", ")}.`);
  }

  const region = project.region?.trim();
  if (region) parts.push(`Setting: ${region}, India.`);

  const aspect = project.aspect?.trim();
  if (aspect) {
    parts.push(
      aspect === "9:16"
        ? "Composition: Vertical portrait 9:16 for mobile screens, keep subjects centered."
        : aspect === "1:1"
        ? "Composition: Balanced 1:1 square framing."
        : "Composition: Cinematic 16:9 widescreen horizontal framing."
    );
  }

  const noLipSync = scene.noLipSyncNote?.trim();
  if (noLipSync) parts.push(noLipSync);

  parts.push(
    "Cinematic, realistic documentary footage for a government scheme outreach film. " +
      "Natural motion, no on-screen captions, subtitles or watermarks."
  );

  return parts.join(" ");
}

/** Preference order when a scene has several bound references. */
const ROLE_RANK: Record<string, number> = {
  first_frame: 0,
  reference: 1,
  grounding: 2,
  source_video: 3,
};

export const MAX_SCENE_REFERENCES = 3;

/**
 * Local file paths to feed the provider as conditioning references.
 *
 * Scene-bound images win; when a scene has none, the project's uploaded
 * grounding/reference images are used instead, so a shot still reflects the
 * user's own material. Only the first few are sent — Veo (the default) uses a
 * single first frame and ignores the rest.
 */
export async function collectSceneReferences(params: {
  sceneId: string;
  projectId: string;
  limit?: number;
}): Promise<string[]> {
  const limit = params.limit ?? MAX_SCENE_REFERENCES;

  const bound = await prisma.sceneAsset.findMany({
    where: { sceneId: params.sceneId },
    include: { asset: true },
  });

  const keys = bound
    .filter((ref) => ref.asset.mime.startsWith("image/"))
    .sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))
    .map((ref) => ref.asset.storageKey);

  if (keys.length === 0) {
    const projectImages = await prisma.asset.findMany({
      where: {
        projectId: params.projectId,
        kind: { in: ["grounding_image", "reference_image"] },
        mime: { startsWith: "image/" },
      },
      orderBy: { createdAt: "asc" },
    });
    keys.push(...projectImages.map((asset) => asset.storageKey));
  }

  const storage = getStorage();
  // `localPath` is only meaningful for the local driver — the only driver
  // implemented — and the providers read these paths directly.
  return keys.slice(0, limit).map((key) => storage.localPath(key));
}

export interface ClipProviderReadiness {
  ready: boolean;
  /** Why rendering cannot start yet, when `ready` is false. */
  reason: string | null;
}

/**
 * Can this project actually render clips right now?
 *
 * Checked before any task is queued so the UI reports a missing key
 * immediately, rather than after several tasks have each failed once. A
 * per-user credential or the operator's env key both satisfy the check.
 */
export async function clipProviderReadiness(params: {
  userId: string;
  videoProvider: string;
}): Promise<ClipProviderReadiness> {
  const name: ProviderName = isProviderName(params.videoProvider)
    ? params.videoProvider
    : "gemini";

  const ok = (): ClipProviderReadiness => ({ ready: true, reason: null });

  switch (name) {
    case "gemini": {
      const ready =
        (await hasCredential(params.userId, "gemini")) ||
        Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());
      return ready
        ? ok()
        : {
            ready: false,
            reason:
              "Add and verify your Google Gemini API key on the Settings → API keys page first.",
          };
    }
    case "replicate": {
      const ready =
        (await hasCredential(params.userId, "replicate")) ||
        Boolean(process.env.REPLICATE_API_TOKEN?.trim());
      return ready
        ? ok()
        : {
            ready: false,
            reason: "Add and verify your Replicate token on the Settings → API keys page first.",
          };
    }
    case "fal": {
      const ready =
        (await hasCredential(params.userId, "fal")) || Boolean(process.env.FAL_KEY?.trim());
      return ready
        ? ok()
        : { ready: false, reason: "Add and verify your fal key on the Settings → API keys page first." };
    }
  }
}

