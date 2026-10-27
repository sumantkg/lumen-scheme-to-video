"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { ProjectDetailView, SceneView } from "@/lib/projects";

type TransitionType =
  | "none"
  | "fade"
  | "dissolve"
  | "fadeblack"
  | "fadewhite"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "slidedown"
  | "circlecrop"
  | "circleopen"
  | "wipeleft"
  | "wiperight"
  | "smoothup"
  | "smoothdown"
  | "pixelize"
  | "radial"
  | "zoomin"
  | "hblur"
  | "squeezeh";

interface TimelineItem {
  instanceId: string;
  scene: SceneView;
  trimStartSec: number;
  trimEndSec: number;
  transition: TransitionType;
  transitionDurationSec: number;
}

type BgmChoice = "none" | "calm" | "cinematic" | "uplifting";

interface EditorDoc {
  sequence: TimelineItem[];
  bgm: BgmChoice;
  bgmVolume: number;
}

type LeftTab = "media" | "audio";
type Selection =
  | { kind: "clip"; id: string }
  | { kind: "transition"; id: string }
  | null;

type RenderMode = "preview" | "export";

interface Notice {
  tone: "success" | "error" | "info";
  text: string;
  href?: string;
  hrefLabel?: string;
}

interface ClipGeometry {
  start: number;
  duration: number;
  end: number;
  transitionDuration: number;
}

interface TrimSession {
  id: string;
  edge: "start" | "end";
  startX: number;
  initialStart: number;
  initialEnd: number;
  source: number;
  moved: boolean;
  snapped: boolean;
}

interface TransitionMenuState {
  id: string;
  x: number;
  y: number;
  placement: "above" | "below";
  maxHeight: number;
}

const TL_PAD = 10;
const TRANSITION_MENU_ESTIMATED_HEIGHT = 400;
const MIN_ZOOM = 12;
const MAX_ZOOM = 220;
const MIN_CLIP_SECONDS = 0.5;
const MAX_TRANSITION_SECONDS = 1.5;
const AUTO_PREVIEW_DELAY_MS = 1200;

const TRANSITIONS: Array<{ id: TransitionType; label: string }> = [
  { id: "none", label: "None" },
  { id: "fade", label: "Cross fade" },
  { id: "dissolve", label: "Dissolve" },
  { id: "fadeblack", label: "Dip to black" },
  { id: "fadewhite", label: "Dip to white" },
  { id: "slideleft", label: "Slide left" },
  { id: "slideright", label: "Slide right" },
  { id: "slideup", label: "Slide up" },
  { id: "slidedown", label: "Slide down" },
  { id: "circlecrop", label: "Circle crop" },
  { id: "circleopen", label: "Circle open" },
  { id: "wipeleft", label: "Wipe left" },
  { id: "wiperight", label: "Wipe right" },
  { id: "smoothup", label: "Smooth up" },
  { id: "smoothdown", label: "Smooth down" },
  { id: "pixelize", label: "Pixelate" },
  { id: "radial", label: "Radial" },
  { id: "zoomin", label: "Zoom in" },
  { id: "hblur", label: "Blur" },
  { id: "squeezeh", label: "Squeeze" },
];

const BGM_CHOICES: Array<{
  id: BgmChoice;
  label: string;
  description: string;
}> = [
  { id: "none", label: "No music", description: "Narration only" },
  { id: "calm", label: "Calm", description: "Soft ambient beds" },
  { id: "cinematic", label: "Cinematic", description: "Wide orchestral swells" },
  { id: "uplifting", label: "Uplifting", description: "Bright, driving rhythm" },
];

const RESOLUTIONS: Record<string, string> = {
  "16:9": "1280 × 720",
  "9:16": "720 × 1280",
  "1:1": "900 × 900",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function sceneBadge(scene: SceneView): string {
  return scene.editorOnly ? "CLIP" : String(scene.index).padStart(2, "0");
}

function sceneLabel(scene: SceneView): string {
  return scene.editorOnly ? "Imported clip" : `Scene ${scene.index}`;
}

function sceneSourceDuration(scene: SceneView): number {
  const measured = scene.clipDurationSec;
  const seconds =
    typeof measured === "number" && Number.isFinite(measured) && measured > 0
      ? measured
      : scene.durationSec;
  return Math.max(MIN_CLIP_SECONDS, seconds);
}

function clipDuration(item: TimelineItem): number {
  return Math.max(MIN_CLIP_SECONDS, item.trimEndSec - item.trimStartSec);
}

function sourceDuration(item: TimelineItem): number {
  return sceneSourceDuration(item.scene);
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function formatTimecode(seconds: number): string {
  const totalFrames = Math.max(0, Math.round(seconds * 30));
  const frames = totalFrames % 30;
  const secs = Math.floor(totalFrames / 30) % 60;
  const mins = Math.floor(totalFrames / 1800) % 60;
  const hours = Math.floor(totalFrames / 108000);
  const head = hours > 0 ? `${String(hours).padStart(2, "0")}:` : "";
  return `${head}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function formatRuler(seconds: number, step: number): string {
  if (step < 1) return `${seconds.toFixed(1)}s`;
  return formatDuration(seconds);
}

function aspectRatioValue(aspect: string): number {
  if (aspect === "9:16") return 9 / 16;
  if (aspect === "1:1") return 1;
  return 16 / 9;
}

interface SavedEditorDoc {
  sequence: Array<{
    instanceId?: string;
    sceneId: string;
    trimStartSec?: number;
    trimEndSec?: number;
    transition?: TransitionType;
    transitionDurationSec?: number;
  }>;
  bgm?: string;
  bgmVolume?: number;
}

function getSavedDoc(
  projectId: string,
  initial: ProjectDetailView
): SavedEditorDoc | null {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`lumen_editor_doc_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sequence)) {
          return parsed as SavedEditorDoc;
        }
      }
    } catch {
      // ignore
    }
  }

  if (initial.editorDoc) {
    try {
      const parsed =
        typeof initial.editorDoc === "string"
          ? JSON.parse(initial.editorDoc)
          : (initial.editorDoc as Record<string, unknown>);
      if (parsed) {
        const items = Array.isArray(parsed.sequence)
          ? parsed.sequence
          : Array.isArray(parsed.items)
            ? parsed.items
            : null;
        if (items) {
          return {
            sequence: items.map((it: Record<string, unknown>) => ({
              instanceId:
                typeof it.instanceId === "string" ? it.instanceId : undefined,
              sceneId: String(
                it.sceneId ?? (it.scene as Record<string, unknown>)?.id
              ),
              trimStartSec:
                typeof it.trimStartSec === "number" ? it.trimStartSec : undefined,
              trimEndSec:
                typeof it.trimEndSec === "number" ? it.trimEndSec : undefined,
              transition: (it.transition as TransitionType) ?? "none",
              transitionDurationSec:
                typeof it.transitionDurationSec === "number"
                  ? it.transitionDurationSec
                  : undefined,
            })),
            bgm:
              typeof (parsed.bgm ?? parsed.backgroundMusic) === "string"
                ? String(parsed.bgm ?? parsed.backgroundMusic)
                : undefined,
            bgmVolume:
              typeof parsed.bgmVolume === "number" ? parsed.bgmVolume : undefined,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function buildInitialDoc(
  initial: ProjectDetailView,
  projectId?: string,
  targetSceneId?: string,
  mode?: string
): EditorDoc {
  const sceneMap = new Map(initial.scenes.map((s) => [s.id, s]));

  // If a specific scene is targeted from SceneCard ("Add to Editor"):
  if (targetSceneId) {
    const target = sceneMap.get(targetSceneId);
    if (target && target.hasClip) {
      return {
        sequence: [
          {
            instanceId: `${target.id}-solo-0`,
            scene: target,
            trimStartSec: 0,
            trimEndSec: sceneSourceDuration(target),
            transition: "none",
            transitionDurationSec: 0.75,
          },
        ],
        bgm: "none",
        bgmVolume: 0.2,
      };
    }
  }

  // If all generated clips are targeted from the Storyboard header ("Add to Editor"):
  if (mode === "all") {
    const scenes = initial.scenes.filter(
      (scene) => scene.hasClip && !scene.hiddenInEditor
    );
    return {
      sequence: scenes.map((scene, index) => ({
        instanceId: `${scene.id}-base-${index}`,
        scene,
        trimStartSec: 0,
        trimEndSec: sceneSourceDuration(scene),
        transition: "none",
        transitionDurationSec: 0.75,
      })),
      bgm: "none",
      bgmVolume: 0.2,
    };
  }

  const saved = projectId ? getSavedDoc(projectId, initial) : null;

  if (saved && Array.isArray(saved.sequence)) {
    const validItems: TimelineItem[] = [];
    saved.sequence.forEach((item, index) => {
      const scene = sceneMap.get(item.sceneId);
      if (scene && scene.hasClip && !scene.hiddenInEditor) {
        const sourceDur = sceneSourceDuration(scene);
        const start = Math.max(0, item.trimStartSec ?? 0);
        const end = Math.min(
          sourceDur,
          Math.max(start + 0.1, item.trimEndSec ?? sourceDur)
        );
        validItems.push({
          instanceId: item.instanceId || `${scene.id}-restored-${index}`,
          scene,
          trimStartSec: start,
          trimEndSec: end,
          transition: item.transition ?? "none",
          transitionDurationSec: item.transitionDurationSec ?? 0.75,
        });
      }
    });

    if (validItems.length > 0 || saved.sequence.length === 0) {
      return {
        sequence: validItems,
        bgm: (["none", "calm", "cinematic", "uplifting"] as BgmChoice[]).includes(saved.bgm as BgmChoice)
          ? (saved.bgm as BgmChoice)
          : "none",
        bgmVolume: typeof saved.bgmVolume === "number" ? saved.bgmVolume : 0.2,
      };
    }
  }

  const scenes = initial.scenes.filter(
    (scene) => scene.hasClip && !scene.hiddenInEditor
  );
  return {
    sequence: scenes.map((scene, index) => ({
      instanceId: `${scene.id}-base-${index}`,
      scene,
      trimStartSec: 0,
      trimEndSec: sceneSourceDuration(scene),
      transition: "none",
      transitionDurationSec: 0.75,
    })),
    bgm: "none",
    bgmVolume: 0.2,
  };
}

function scenePosterUrl(projectId: string, scene: SceneView, bust: string): string {
  return `/api/projects/${projectId}/scenes/${scene.id}/poster?t=${encodeURIComponent(bust)}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lumen-video"
  );
}

interface IconProps {
  size?: number;
}

function Svg({
  children,
  size = 16,
  viewBox = "0 0 24 24",
  strokeWidth = 1.8,
}: IconProps & { children: ReactNode; viewBox?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconArrowLeft = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </Svg>
);

const IconUndo = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h9a7 7 0 0 1 0 14h-2" />
  </Svg>
);

const IconRedo = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9h-9a7 7 0 0 0 0 14h2" />
  </Svg>
);

const IconPanelLeft = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Svg>
);

const IconRefresh = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M20 11a8 8 0 1 0-2.3 6.3" />
    <path d="M20 4v7h-7" />
  </Svg>
);

const IconDownload = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
);

const IconSearch = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4-4" />
  </Svg>
);

const IconPlus = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

const IconUpload = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M5 20h14" />
  </Svg>
);

const IconMinus = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M5 12h14" />
  </Svg>
);

const IconCheck = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="m5 12 4.5 4.5L19 7" />
  </Svg>
);

const IconX = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

const IconFilm = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Svg>
);

const IconMusic = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="16" cy="16" r="3" />
  </Svg>
);

const IconScissors = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="m8.2 7.7 12 9.3M20.2 7 8.2 16.3" />
  </Svg>
);

const IconTrash = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);

const IconEyeOff = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="m3 3 18 18" />
    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
    <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3.3 4.2" />
    <path d="M6.6 6.6C3.8 8.4 2 12 2 12s3 7 10 7a10.6 10.6 0 0 0 5.4-1.5" />
  </Svg>
);

const IconPlay = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" stroke="none" />
  </Svg>
);

const IconPause = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </Svg>
);

const IconSkipStart = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M6 5v14" />
    <path d="M19 5 9 12l10 7Z" fill="currentColor" stroke="none" />
  </Svg>
);

const IconSkipEnd = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M18 5v14" />
    <path d="M5 5l10 7-10 7Z" fill="currentColor" stroke="none" />
  </Svg>
);

const IconStepBack = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M11 6 4 12l7 6Z" fill="currentColor" stroke="none" />
    <path d="M20 6l-7 6 7 6Z" fill="currentColor" stroke="none" />
  </Svg>
);

const IconStepForward = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M13 6l7 6-7 6Z" fill="currentColor" stroke="none" />
    <path d="M4 6l7 6-7 6Z" fill="currentColor" stroke="none" />
  </Svg>
);

const IconLoop = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M17 2.5 20 6l-3 3.5" />
    <path d="M4 11V9a3 3 0 0 1 3-3h13" />
    <path d="M7 21.5 4 18l3-3.5" />
    <path d="M20 13v2a3 3 0 0 1-3 3H4" />
  </Svg>
);

const IconVolume = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 9h3l4-3v12l-4-3H4Z" />
    <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
  </Svg>
);

const IconVolumeMute = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 9h3l4-3v12l-4-3H4Z" />
    <path d="m16 10 4 4M20 10l-4 4" />
  </Svg>
);

const IconGrid = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 12h18M12 4v16" />
  </Svg>
);

const IconFullscreen = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </Svg>
);

const IconClock = ({ size = 16 }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

function TransitionGlyph({
  type,
  size = 36,
}: {
  type: TransitionType;
  size?: number;
}) {
  const width = size;
  const height = Math.round(size * 0.7);
  const left = { fill: "#a78bfa", opacity: 0.9 };
  const right = { fill: "#22d3ee", opacity: 0.9 };
  const line = { stroke: "#f3f1ff", strokeWidth: 1.6, strokeLinecap: "round" as const };
  const faded = { fill: "#8b5cf6", opacity: 0.35 };

  const arrow = (direction: "left" | "right" | "up" | "down") => {
    if (direction === "left") return <path d="M26 12H14m4-4-4 4 4 4" {...line} />;
    if (direction === "right") return <path d="M14 12h12m-4-4 4 4-4 4" {...line} />;
    if (direction === "up") return <path d="M20 20V8m-4 4 4-4 4 4" {...line} />;
    return <path d="M20 8v12m-4-4 4 4 4-4" {...line} />;
  };

  let overlay: ReactNode = null;
  if (type === "none") {
    overlay = <path d="M20 3v18" stroke="#f3f1ff" strokeWidth="1.4" strokeDasharray="2 3" opacity="0.7" />;
  } else if (type === "fade" || type === "dissolve") {
    overlay = (
      <>
        <rect x="10" y="3" width="20" height="18" rx="3" fill="url(#le-tf)" opacity="0.85" />
        <path d={type === "dissolve" ? "M16 9h1M19 8h1M22 10h1M17 13h1M20 12h1M23 14h1" : "M14 13h12"} stroke="#f3f1ff" strokeWidth="1.4" strokeLinecap="round" />
      </>
    );
  } else if (type === "fadeblack" || type === "fadewhite") {
    overlay = (
      <>
        <rect x="17" y="3" width="7" height="18" fill={type === "fadeblack" ? "#05050a" : "#f8fafc"} />
        <path d="M14 13h5m5 0h2" stroke="#f3f1ff" strokeWidth="1.4" strokeLinecap="round" />
      </>
    );
  } else if (type === "slideleft" || type === "wipeleft" || type === "smoothdown" || type === "smoothup") {
    overlay = arrow(type === "smoothdown" ? "down" : type === "smoothup" ? "up" : "left");
  } else if (type === "slideright" || type === "wiperight") {
    overlay = arrow("right");
  } else if (type === "slideup") {
    overlay = arrow("up");
  } else if (type === "slidedown") {
    overlay = arrow("down");
  } else if (type === "circlecrop" || type === "circleopen") {
    overlay = (
      <>
        <circle cx="20" cy="12" r="7" fill={type === "circlecrop" ? "#f3f1ff" : "none"} stroke="#f3f1ff" strokeWidth="1.5" opacity={type === "circlecrop" ? 0.9 : 1} />
        {type === "circleopen" && <circle cx="20" cy="12" r="3.5" fill="#8b5cf6" opacity="0.8" />}
      </>
    );
  } else if (type === "pixelize") {
    overlay = (
      <g fill="#f3f1ff" opacity="0.85">
        <rect x="15" y="7" width="3" height="3" />
        <rect x="19" y="7" width="3" height="3" />
        <rect x="23" y="7" width="3" height="3" />
        <rect x="15" y="11" width="3" height="3" />
        <rect x="19" y="11" width="3" height="3" />
        <rect x="23" y="11" width="3" height="3" />
        <rect x="15" y="15" width="3" height="3" />
        <rect x="19" y="15" width="3" height="3" />
        <rect x="23" y="15" width="3" height="3" />
      </g>
    );
  } else if (type === "radial") {
    overlay = (
      <g stroke="#f3f1ff" strokeWidth="1.4" strokeLinecap="round">
        <path d="M20 12V4M20 12v8M12 12h16M16 8l8 8M24 8l-8 8" />
      </g>
    );
  } else if (type === "zoomin") {
    overlay = (
      <g stroke="#f3f1ff" strokeWidth="1.5">
        <rect x="14" y="6" width="12" height="12" rx="2" opacity="0.55" />
        <rect x="17" y="9" width="6" height="6" rx="1" />
      </g>
    );
  } else if (type === "hblur") {
    overlay = (
      <g stroke="#f3f1ff" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <path d="M13 9h14M12 12h16M13 15h14" />
      </g>
    );
  } else if (type === "squeezeh") {
    overlay = (
      <g stroke="#f3f1ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 12h4m-4 0 2-2m-2 2 2 2M26 12h-4m4 0-2-2m2 2-2 2" />
      </g>
    );
  }

  return (
    <svg width={width} height={height} viewBox="0 0 40 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="le-tf" x1="10" y1="12" x2="30" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" stopOpacity="0.2" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <rect x="2" y="3" width="18" height="22" rx="4" {...left} {...faded} opacity="0.65" />
      <rect x="20" y="3" width="18" height="22" rx="4" {...right} opacity="0.55" />
      {overlay}
    </svg>
  );
}

export default function VideoEditor({
  projectId,
  initial,
  targetSceneId,
  mode,
}: {
  projectId: string;
  initial: ProjectDetailView;
  targetSceneId?: string;
  mode?: string;
}) {
  const [doc, setDoc] = useState<EditorDoc>(() =>
    buildInitialDoc(initial, projectId, targetSceneId, mode)
  );
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);
  const presentRef = useRef<EditorDoc>(doc);
  const [dirty, setDirty] = useState(false);
  const docKey = useMemo(() => JSON.stringify(doc), [doc]);

  useEffect(() => {
    if (targetSceneId) {
      const sceneMap = new Map(initial.scenes.map((s) => [s.id, s]));
      const target = sceneMap.get(targetSceneId);
      if (target && target.hasClip) {
        const item: TimelineItem = {
          instanceId: `${target.id}-solo-${Date.now()}`,
          scene: target,
          trimStartSec: 0,
          trimEndSec: sceneSourceDuration(target),
          transition: "none",
          transitionDurationSec: 0.75,
        };
        setDoc((current) => ({
          ...current,
          sequence: [item],
        }));
        setSelection({ kind: "clip", id: item.instanceId });
        setCurrentTime(0);
      }
    } else if (mode === "all") {
      const scenes = initial.scenes.filter(
        (scene) => scene.hasClip && !scene.hiddenInEditor
      );
      const items: TimelineItem[] = scenes.map((scene, index) => ({
        instanceId: `${scene.id}-base-${index}-${Date.now()}`,
        scene,
        trimStartSec: 0,
        trimEndSec: sceneSourceDuration(scene),
        transition: "none",
        transitionDurationSec: 0.75,
      }));
      setDoc((current) => ({
        ...current,
        sequence: items,
      }));
      setSelection(items[0] ? { kind: "clip", id: items[0].instanceId } : null);
      setCurrentTime(0);
    }
  }, [targetSceneId, mode, initial.scenes]);

  useEffect(() => {
    try {
      const serializable: SavedEditorDoc = {
        sequence: doc.sequence.map((item) => ({
          instanceId: item.instanceId,
          sceneId: item.scene.id,
          trimStartSec: item.trimStartSec,
          trimEndSec: item.trimEndSec,
          transition: item.transition,
          transitionDurationSec: item.transitionDurationSec,
        })),
        bgm: doc.bgm,
        bgmVolume: doc.bgmVolume,
      };
      localStorage.setItem(
        `lumen_editor_doc_${projectId}`,
        JSON.stringify(serializable)
      );
    } catch {
      // ignore
    }
  }, [doc, projectId]);

  const [selection, setSelection] = useState<Selection>(
    () => (doc.sequence[0] ? { kind: "clip", id: doc.sequence[0].instanceId } : null)
  );
  const [leftTab, setLeftTab] = useState<LeftTab>("media");
  const [leftOpen, setLeftOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [sceneLibrary, setSceneLibrary] = useState<SceneView[]>(initial.scenes);
  const [importing, setImporting] = useState(false);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);
  const [restoringSceneId, setRestoringSceneId] = useState<string | null>(null);

  const [hasRender, setHasRender] = useState(initial.hasFinalVideo);
  const [mergedVideoUrl, setMergedVideoUrl] = useState(
    initial.hasFinalVideo
      ? `/api/projects/${projectId}/video?t=${encodeURIComponent(initial.updatedAt)}`
      : ""
  );
  const [posterBust, setPosterBust] = useState(initial.updatedAt);
  const [rendering, setRendering] = useState<RenderMode | null>(null);
  const [autoRendering, setAutoRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const renderingRef = useRef(false);
  const renderIdRef = useRef(0);
  const activeRenderDocKeyRef = useRef<string | null>(null);
  const latestDocKeyRef = useRef(docKey);
  const failedAutoDocKeyRef = useRef<string | null>(null);
  const autoPreviewRef = useRef<() => void>(() => {});
  const [notice, setNotice] = useState<Notice | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef(0);

  const [auditioning, setAuditioning] = useState<string | null>(null);
  const auditionRef = useRef<HTMLAudioElement | null>(null);

  const [pps, setPps] = useState(60);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [trimDrag, setTrimDrag] = useState<{ id: string; edge: "start" | "end" } | null>(
    null
  );
  const [transitionMenu, setTransitionMenu] = useState<TransitionMenuState | null>(
    null
  );
  const trimSessionRef = useRef<TrimSession | null>(null);
  const transitionAnchorRef = useRef<HTMLElement | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const instanceCounter = useRef(0);
  const autoFitRef = useRef(false);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});

  const commit = useCallback((update: (current: EditorDoc) => EditorDoc) => {
    const previous = presentRef.current;
    const next = update(previous);
    if (next === previous) return;
    setPast((items) => [...items.slice(-59), previous]);
    setFuture([]);
    presentRef.current = next;
    setDoc(next);
    setDirty(true);
  }, []);

  const updateLive = useCallback((update: (current: EditorDoc) => EditorDoc) => {
    const next = update(presentRef.current);
    presentRef.current = next;
    setDoc(next);
    setDirty(true);
  }, []);

  const snapshot = useCallback(() => {
    const previous = presentRef.current;
    setPast((items) => [...items.slice(-59), previous]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([presentRef.current, ...future].slice(0, 60));
    presentRef.current = previous;
    setDoc(previous);
    setDirty(true);
  }, [future, past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past.slice(-59), presentRef.current]);
    presentRef.current = next;
    setDoc(next);
    setDirty(true);
  }, [future, past]);

  const geometry = useMemo<ClipGeometry[]>(() => {
    const durations = doc.sequence.map((item) => clipDuration(item));
    const transitionDurations = doc.sequence.map((item, index) => {
      if (index >= doc.sequence.length - 1) return 0;
      if (item.transition === "none") return 0;
      return Math.max(
        0.05,
        Math.min(
          item.transitionDurationSec,
          MAX_TRANSITION_SECONDS,
          durations[index] / 2,
          durations[index + 1] / 2
        )
      );
    });

    const result: ClipGeometry[] = [];
    let cursor = 0;
    for (let index = 0; index < doc.sequence.length; index++) {
      const start = cursor;
      const duration = durations[index];
      result.push({
        start,
        duration,
        end: start + duration,
        transitionDuration: transitionDurations[index],
      });
      cursor = start + duration - transitionDurations[index];
    }
    return result;
  }, [doc.sequence]);

  const layoutGeometry = geometry;

  const totalDuration = useMemo(() => {
    if (geometry.length === 0) return 0;
    const last = geometry[geometry.length - 1];
    return last.start + last.duration;
  }, [geometry]);

  const effectiveTotal =
    hasRender && !dirty && videoDuration > 0 ? videoDuration : totalDuration;

  const clipAtTime = useCallback(
    (time: number): number | null => {
      for (let index = geometry.length - 1; index >= 0; index--) {
        const item = geometry[index];
        if (time >= item.start && time < item.start + item.duration) return index;
      }
      return null;
    },
    [geometry]
  );

  const transitionMenuItem = transitionMenu
    ? doc.sequence.findIndex((item) => item.instanceId === transitionMenu.id)
    : -1;
  const transitionMenuClip =
    transitionMenuItem >= 0 ? doc.sequence[transitionMenuItem] : null;
  const transitionMenuNext =
    transitionMenuItem >= 0 ? doc.sequence[transitionMenuItem + 1] ?? null : null;

  const hiddenScenes = useMemo(
    () => sceneLibrary.filter((scene) => scene.hiddenInEditor),
    [sceneLibrary]
  );

  const mediaScenes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const visible = sceneLibrary.filter((scene) => !scene.hiddenInEditor);
    if (!needle) return visible;
    return visible.filter((scene) => {
      return (
        scene.title.toLowerCase().includes(needle) ||
        String(scene.index).includes(needle) ||
        scene.visualPrompt.toLowerCase().includes(needle)
      );
    });
  }, [sceneLibrary, search]);

  const contentWidth = Math.max(
    viewportWidth,
    Math.round(totalDuration * pps) + TL_PAD * 2
  );
  const playheadX = TL_PAD + currentTime * pps;

  const tickStep = useMemo(() => {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
    return steps.find((step) => step * pps >= 78) ?? 180;
  }, [pps]);

  const ticks = useMemo(() => {
    const values: number[] = [];
    if (totalDuration <= 0) return values;
    const limit = totalDuration + tickStep;
    for (let value = 0; value <= limit; value += tickStep) {
      values.push(Number(value.toFixed(3)));
    }
    return values;
  }, [tickStep, totalDuration]);

  const frameStyle = useMemo(() => {
    const ratio = aspectRatioValue(initial.aspect);
    if (stageBox.width <= 0 || stageBox.height <= 0) {
      return { aspectRatio: String(ratio) };
    }
    let width = stageBox.width;
    let height = width / ratio;
    if (height > stageBox.height) {
      height = stageBox.height;
      width = height * ratio;
    }
    return { width: `${Math.floor(width)}px`, height: `${Math.floor(height)}px` };
  }, [initial.aspect, stageBox.height, stageBox.width]);

  const nextInstanceId = useCallback((sceneId: string): string => {
    instanceCounter.current += 1;
    return `${sceneId}-${Date.now()}-${instanceCounter.current}`;
  }, []);

  const maxTransitionForIndex = useCallback(
    (index: number): number => {
      if (index < 0 || index >= doc.sequence.length - 1) return 0.1;
      const first = clipDuration(doc.sequence[index]);
      const second = clipDuration(doc.sequence[index + 1]);
      return Math.max(
        0.1,
        Math.min(MAX_TRANSITION_SECONDS, first / 2 - 0.05, second / 2 - 0.05)
      );
    },
    [doc.sequence]
  );

  const applyTransition = useCallback(
    (type: TransitionType, targetId?: string) => {
      const id =
        targetId ?? (selection?.kind === "transition" ? selection.id : null);
      if (!id || doc.sequence.length < 2) return;
      commit((current) => ({
        ...current,
        sequence: current.sequence.map((item) =>
          item.instanceId === id ? { ...item, transition: type } : item
        ),
      }));
      setSelection({ kind: "transition", id });
    },
    [commit, doc.sequence.length, selection]
  );

  const updateTransitionDuration = useCallback(
    (id: string, value: number) => {
      updateLive((current) => ({
        ...current,
        sequence: current.sequence.map((item) =>
          item.instanceId === id
            ? { ...item, transitionDurationSec: Math.round(value * 100) / 100 }
            : item
        ),
      }));
    },
    [updateLive]
  );

  const addScene = useCallback(
    (scene: SceneView) => {
      if (!scene.hasClip) return;
      const item: TimelineItem = {
        instanceId: nextInstanceId(scene.id),
        scene,
        trimStartSec: 0,
        trimEndSec: sceneSourceDuration(scene),
        transition: "none",
        transitionDurationSec: 0.75,
      };
      commit((current) => {
        const sequence = [...current.sequence, item];
        return { ...current, sequence };
      });
      setSelection({ kind: "clip", id: item.instanceId });
    },
    [commit, nextInstanceId]
  );

  const importClips = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || importing) return;
      setImporting(true);
      const imported: SceneView[] = [];
      const failures: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        try {
          const response = await fetch(`/api/projects/${projectId}/clips/import`, {
            method: "POST",
            body: form,
          });
          const body = (await response.json().catch(() => ({}))) as {
            scene?: SceneView;
            error?: string;
          };
          if (!response.ok || !body.scene) {
            throw new Error(body.error ?? `Could not import “${file.name}”.`);
          }
          imported.push(body.scene);
        } catch (error) {
          failures.push(
            error instanceof Error ? error.message : `Could not import “${file.name}”.`
          );
        }
      }
      if (imported.length > 0) {
        setSceneLibrary((current) =>
          [...current, ...imported].sort((a, b) => a.index - b.index)
        );
        for (const scene of imported) addScene(scene);
      }
      if (failures.length > 0) {
        setNotice({ tone: "error", text: failures.join(" ") });
      } else if (imported.length > 0) {
        setNotice({
          tone: "success",
          text:
            imported.length === 1
              ? `Imported “${imported[0].title}”.`
              : `Imported ${imported.length} clips.`,
        });
      }
      setImporting(false);
    },
    [addScene, importing, projectId]
  );

  const removeSceneFromLibrary = useCallback(
    async (scene: SceneView) => {
      if (deletingSceneId) return;
      setDeletingSceneId(scene.id);
      try {
        const response = await fetch(
          `/api/projects/${projectId}/scenes/${scene.id}`,
          { method: "DELETE" }
        );
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          hidden?: boolean;
        };
        if (!response.ok) {
          throw new Error(body.error ?? `Could not remove “${scene.title}”.`);
        }

        const hidden = body.hidden === true;
        const removedIds = new Set(
          presentRef.current.sequence
            .filter((item) => item.scene.id === scene.id)
            .map((item) => item.instanceId)
        );

        if (hidden) {
          setSceneLibrary((current) =>
            current.map((entry) =>
              entry.id === scene.id
                ? { ...entry, hiddenInEditor: true }
                : entry
            )
          );
        } else {
          setSceneLibrary((current) =>
            current.filter((entry) => entry.id !== scene.id)
          );
        }
        if (removedIds.size > 0) {
          commit((current) => ({
            ...current,
            sequence: current.sequence.filter(
              (item) => !removedIds.has(item.instanceId)
            ),
          }));
          setSelection((current) =>
            current?.kind === "clip" && removedIds.has(current.id)
              ? null
              : current
          );
        }
        setNotice({
          tone: "success",
          text: hidden
            ? `“${scene.title}” was hidden from the editor. The storyboard is unchanged.`
            : removedIds.size > 0
              ? `Removed imported clip “${scene.title}” from the editor and timeline.`
              : `Removed imported clip “${scene.title}”.`,
        });
      } catch (error) {
        setNotice({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not remove that clip.",
        });
      } finally {
        setDeletingSceneId(null);
      }
    },
    [commit, deletingSceneId, projectId]
  );

  const restoreSceneToLibrary = useCallback(
    async (scene: SceneView) => {
      if (restoringSceneId) return;
      setRestoringSceneId(scene.id);
      try {
        const response = await fetch(
          `/api/projects/${projectId}/scenes/${scene.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hiddenInEditor: false }),
          }
        );
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? `Could not restore “${scene.title}”.`);
        }
        setSceneLibrary((current) =>
          current.map((entry) =>
            entry.id === scene.id
              ? { ...entry, hiddenInEditor: false }
              : entry
          )
        );
        setNotice({
          tone: "success",
          text: `Restored “${scene.title}” to the media panel.`,
        });
      } catch (error) {
        setNotice({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not restore that clip.",
        });
      } finally {
        setRestoringSceneId(null);
      }
    },
    [projectId, restoringSceneId]
  );

  const duplicateClip = useCallback(
    (id: string) => {
      const index = doc.sequence.findIndex((item) => item.instanceId === id);
      if (index < 0) return;
      const source = doc.sequence[index];
      const copy: TimelineItem = {
        ...source,
        instanceId: nextInstanceId(source.scene.id),
      };
      commit((current) => {
        const sequence = [...current.sequence];
        const at = sequence.findIndex((item) => item.instanceId === id);
        if (at < 0) return current;
        const original = sequence[at];
        sequence[at] = { ...original, transition: "fade" };
        sequence.splice(at + 1, 0, copy);
        return { ...current, sequence };
      });
      setSelection({ kind: "clip", id: copy.instanceId });
    },
    [commit, doc.sequence, nextInstanceId]
  );

  const removeClip = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        sequence: current.sequence.filter((item) => item.instanceId !== id),
      }));
      setSelection(null);
    },
    [commit]
  );

  const splitAtPlayhead = useCallback(() => {
    const index = clipAtTime(currentTime);
    if (index === null) {
      setNotice({ tone: "info", text: "Move the playhead over a clip to split it." });
      return;
    }
    const item = doc.sequence[index];
    const timing = geometry[index];
    if (!item || !timing) return;
    const sourceTime = item.trimStartSec + (currentTime - timing.start);
    if (
      sourceTime <= item.trimStartSec + 0.2 ||
      sourceTime >= item.trimEndSec - 0.2
    ) {
      setNotice({ tone: "info", text: "Place the playhead further inside the clip." });
      return;
    }
    const leftItem: TimelineItem = {
      ...item,
      trimEndSec: roundTenth(sourceTime),
      transition: "none",
    };
    const rightItem: TimelineItem = {
      ...item,
      instanceId: nextInstanceId(item.scene.id),
      trimStartSec: roundTenth(sourceTime),
    };
    commit((current) => {
      const sequence = current.sequence.flatMap((entry) =>
        entry.instanceId === item.instanceId ? [leftItem, rightItem] : [entry]
      );
      return { ...current, sequence };
    });
    setSelection({ kind: "clip", id: rightItem.instanceId });
    setNotice({ tone: "info", text: `Split “${item.scene.title}” at the playhead.` });
  }, [
    clipAtTime,
    commit,
    currentTime,
    doc.sequence,
    geometry,
    nextInstanceId,
  ]);

  const beginTrim = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      id: string,
      edge: "start" | "end"
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const item = presentRef.current.sequence.find(
        (entry) => entry.instanceId === id
      );
      if (!item) return;

      const source = sourceDuration(item);
      trimSessionRef.current = {
        id,
        edge,
        startX: event.clientX,
        initialStart: item.trimStartSec,
        initialEnd: Math.min(item.trimEndSec, source),
        source,
        moved: false,
        snapped: false,
      };
      setTrimDrag({ id, edge });
      setTransitionMenu(null);
      setSelection({ kind: "clip", id });

      const onMove = (moveEvent: PointerEvent) => {
        const active = trimSessionRef.current;
        if (!active || active.id !== id) return;
        const delta = (moveEvent.clientX - active.startX) / pps;
        if (!active.moved) {
          if (Math.abs(moveEvent.clientX - active.startX) < 2) return;
          active.moved = true;
          snapshot();
        }
        if (edge === "start") {
          const nextStart = clamp(
            roundTenth(active.initialStart + delta),
            0,
            active.initialEnd - MIN_CLIP_SECONDS
          );
          updateLive((current) => ({
            ...current,
            sequence: current.sequence.map((entry) =>
              entry.instanceId === id
                ? { ...entry, trimStartSec: nextStart }
                : entry
            ),
          }));
        } else {
          const nextEnd = clamp(
            roundTenth(active.initialEnd + delta),
            active.initialStart + MIN_CLIP_SECONDS,
            active.source
          );
          updateLive((current) => ({
            ...current,
            sequence: current.sequence.map((entry) =>
              entry.instanceId === id ? { ...entry, trimEndSec: nextEnd } : entry
            ),
          }));
        }
      };

      const finish = () => {
        trimSessionRef.current = null;
        setTrimDrag(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [pps, snapshot, updateLive]
  );

  const placeTransitionMenu = useCallback((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const halfWidth = Math.min(169, window.innerWidth / 2 - 12);
    const spaceAbove = Math.max(0, rect.top - 12);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 12);
    const placement: "above" | "below" =
      spaceAbove >= TRANSITION_MENU_ESTIMATED_HEIGHT || spaceAbove >= spaceBelow
        ? "above"
        : "below";
    return {
      x: clamp(
        rect.left + rect.width / 2,
        halfWidth + 8,
        Math.max(halfWidth + 8, window.innerWidth - halfWidth - 8)
      ),
      y:
        placement === "above"
          ? Math.max(12, rect.top - 10)
          : rect.bottom + 10,
      placement,
      maxHeight: Math.max(160, placement === "above" ? spaceAbove : spaceBelow),
    };
  }, []);

  const openTransitionMenu = useCallback(
    (id: string, element: HTMLElement) => {
      transitionAnchorRef.current = element;
      const point = placeTransitionMenu(element);
      setSelection({ kind: "transition", id });
      setTransitionMenu((current) =>
        current?.id === id ? null : { id, ...point }
      );
    },
    [placeTransitionMenu]
  );

  useEffect(() => {
    const id = transitionMenu?.id;
    if (!id) return;
    let frame = 0;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(".le-transition-pop") ||
        target?.closest("[data-transition-trigger]")
      ) {
        return;
      }
      setTransitionMenu(null);
    };
    const reposition = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchor = transitionAnchorRef.current;
        if (!anchor) return;
        const point = placeTransitionMenu(anchor);
        setTransitionMenu((current) => {
          if (!current || current.id !== id) return current;
          if (current.x === point.x && current.y === point.y) return current;
          return { ...current, ...point };
        });
      });
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [placeTransitionMenu, transitionMenu?.id]);

  const reorderClip = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      commit((current) => {
        const from = current.sequence.findIndex((item) => item.instanceId === fromId);
        const to = current.sequence.findIndex((item) => item.instanceId === toId);
        if (from < 0 || to < 0) return current;
        const sequence = [...current.sequence];
        const [moved] = sequence.splice(from, 1);
        sequence.splice(to, 0, moved);
        return { ...current, sequence };
      });
    },
    [commit]
  );

  const seekTo = useCallback(
    (time: number) => {
      const max = hasRender
        ? videoDuration > 0
          ? videoDuration
          : effectiveTotal
        : totalDuration;
      const target = clamp(time, 0, Math.max(0, max));
      setCurrentTime(target);
      const video = videoRef.current;
      if (video && hasRender) {
        try {
          video.currentTime = target;
        } catch {
          pendingSeekRef.current = target;
        }
      }
    },
    [effectiveTotal, hasRender, totalDuration, videoDuration]
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !hasRender) return;
    if (video.paused) {
      void video.play().catch(() => {
        setNotice({ tone: "error", text: "The browser could not start playback." });
      });
    } else {
      video.pause();
    }
  }, [hasRender]);

  const skip = useCallback(
    (delta: number) => {
      seekTo(currentTime + delta);
    },
    [currentTime, seekTo]
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const content = timelineContentRef.current;
      if (!content) return;
      const rect = content.getBoundingClientRect();
      const time = clamp((clientX - rect.left - TL_PAD) / pps, 0, totalDuration);
      seekTo(time);
    },
    [pps, seekTo, totalDuration]
  );

  const beginScrub = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      scrubbingRef.current = true;
      setScrubbing(true);
      seekFromClientX(event.clientX);
      const onMove = (moveEvent: PointerEvent) => seekFromClientX(moveEvent.clientX);
      const onUp = () => {
        scrubbingRef.current = false;
        setScrubbing(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [seekFromClientX]
  );

  const fitTimeline = useCallback(() => {
    if (totalDuration <= 0 || viewportWidth <= 0) return;
    const available = Math.max(120, viewportWidth - TL_PAD * 2 - 32);
    setPps(clamp(available / totalDuration, MIN_ZOOM, MAX_ZOOM));
    if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft = 0;
  }, [totalDuration, viewportWidth]);

  const toggleFullscreen = useCallback(() => {
    const element = stageWrapRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    void element.requestFullscreen().catch(() => {
      setNotice({ tone: "error", text: "Fullscreen is not available in this browser." });
    });
  }, []);

  const stopAudition = useCallback(() => {
    if (auditionRef.current) {
      auditionRef.current.pause();
      auditionRef.current = null;
    }
    setAuditioning(null);
  }, []);

  const toggleAudition = useCallback(
    (id: string) => {
      if (auditioning === id) {
        stopAudition();
        return;
      }
      stopAudition();
      const audio = new Audio(`/audio/${id}.mp3`);
      audio.loop = true;
      audio.volume = clamp(doc.bgmVolume, 0.02, 1);
      audio.play().catch(() => {
        setNotice({ tone: "error", text: "Could not preview that track." });
      });
      auditionRef.current = audio;
      setAuditioning(id);
    },
    [auditioning, doc.bgmVolume, stopAudition]
  );

  const triggerDownload = useCallback(
    (url: string) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(initial.title)}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    [initial.title]
  );

  const renderSequence = useCallback(
    async (mode: RenderMode, options?: { auto?: boolean }) => {
      if (doc.sequence.length === 0) return;
      const auto = options?.auto === true;
      const requestDocKey = docKey;
      const requestId = ++renderIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      renderingRef.current = true;
      activeRenderDocKeyRef.current = requestDocKey;
      setAutoRendering(auto);
      setRenderError(null);
      setRendering(mode);
      if (!auto) setNotice(null);
      if (auto) videoRef.current?.pause();
      pendingSeekRef.current = currentTime;
      try {
        const response = await fetch(`/api/projects/${projectId}/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: doc.sequence.map((item) => ({
              sceneId: item.scene.id,
              trimStartSec: item.trimStartSec,
              trimEndSec: item.trimEndSec,
              transition: item.transition,
              transitionDurationSec: item.transitionDurationSec,
            })),
            backgroundMusic: doc.bgm,
            bgmVolume: doc.bgmVolume,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          finalUrl?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "The render did not complete.");

        const isLatest =
          requestId === renderIdRef.current &&
          requestDocKey === latestDocKeyRef.current;
        if (!isLatest) return;

        const url = body.finalUrl ?? `/api/projects/${projectId}/video?t=${Date.now()}`;
        failedAutoDocKeyRef.current = null;
        setMergedVideoUrl(url);
        setHasRender(true);
        setPosterBust(String(Date.now()));
        setDirty(false);
        if (mode === "export") {
          triggerDownload(url);
          setNotice({
            tone: "success",
            text: "Export ready. Your download has started.",
            href: url,
            hrefLabel: "Download again",
          });
        } else if (!auto) {
          setNotice({ tone: "success", text: "Preview updated with the latest edits." });
        }
      } catch (error) {
        const aborted =
          error instanceof DOMException && error.name === "AbortError";
        const isCurrent = requestId === renderIdRef.current;
        if (aborted) {
          if (isCurrent && !auto) {
            setNotice({ tone: "info", text: "Render cancelled." });
          }
        } else if (isCurrent) {
          const message = error instanceof Error ? error.message : String(error);
          if (auto) failedAutoDocKeyRef.current = requestDocKey;
          setRenderError(message);
          setNotice({ tone: "error", text: message });
        }
      } finally {
        if (requestId === renderIdRef.current) {
          renderingRef.current = false;
          abortRef.current = null;
          setRendering(null);
          setAutoRendering(false);
        }
      }
    },
    [currentTime, doc, docKey, projectId, triggerDownload]
  );

  const cancelRender = useCallback(() => {
    failedAutoDocKeyRef.current = latestDocKeyRef.current;
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    latestDocKeyRef.current = docKey;
  }, [docKey]);

  useEffect(() => {
    autoPreviewRef.current = () => {
      if (renderingRef.current) return;
      void renderSequence("preview", { auto: true });
    };
  }, [renderSequence]);

  useEffect(() => {
    if (doc.sequence.length === 0) return;
    if (hasRender && !dirty) return;
    if (failedAutoDocKeyRef.current === docKey) return;
    if (trimDrag || scrubbing || draggingId) return;
    if (rendering !== null) {
      if (
        rendering === "preview" &&
        activeRenderDocKeyRef.current !== docKey
      ) {
        abortRef.current?.abort();
      }
      return;
    }
    const timer = window.setTimeout(() => {
      autoPreviewRef.current();
    }, AUTO_PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    dirty,
    hasRender,
    docKey,
    doc.sequence.length,
    trimDrag,
    scrubbing,
    draggingId,
    rendering,
  ]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const narrow = window.innerWidth < 1180;
    setLeftOpen(!narrow);
    const onResize = () => {
      if (window.innerWidth < 900) {
        setLeftOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const element = stageViewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setStageBox({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = timelineScrollRef.current;
    if (!element) return;
    const update = () => setViewportWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (autoFitRef.current || viewportWidth <= 0 || totalDuration <= 0) return;
    const available = Math.max(120, viewportWidth - TL_PAD * 2 - 32);
    setPps(clamp(available / totalDuration, MIN_ZOOM, MAX_ZOOM));
    autoFitRef.current = true;
  }, [totalDuration, viewportWidth]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!scrubbingRef.current) setCurrentTime(video.currentTime);
    };
    const onLoadedMetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      setVideoDuration(duration);
      if (pendingSeekRef.current > 0) {
        const target = clamp(
          pendingSeekRef.current,
          0,
          duration > 0 ? duration : pendingSeekRef.current
        );
        try {
          video.currentTime = target;
        } catch {
          // Ignore seek failures while metadata settles.
        }
        setCurrentTime(target);
        pendingSeekRef.current = 0;
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [hasRender]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video && !scrubbingRef.current) setCurrentTime(video.currentTime);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.loop = loop;
  }, [hasRender, loop, muted, volume]);

  useEffect(() => {
    if (!isPlaying || scrubbing) return;
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    const x = TL_PAD + currentTime * pps;
    const left = scroller.scrollLeft;
    const right = left + scroller.clientWidth;
    if (x < left + 60 || x > right - 100) {
      scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.35);
    }
  }, [currentTime, isPlaying, pps, scrubbing]);

  useEffect(() => {
    if (auditionRef.current) {
      auditionRef.current.volume = clamp(doc.bgmVolume, 0.02, 1);
    }
  }, [doc.bgmVolume]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      auditionRef.current?.pause();
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (currentTime <= totalDuration) return;
    setCurrentTime(totalDuration);
    if (videoRef.current && hasRender) {
      try {
        videoRef.current.currentTime = Math.min(
          totalDuration,
          videoRef.current.duration || totalDuration
        );
      } catch {
        // Ignore out-of-range seeks while the preview reloads.
      }
    }
  }, [currentTime, hasRender, totalDuration]);

  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "d") {
        if (selection?.kind === "clip") {
          event.preventDefault();
          duplicateClip(selection.id);
        }
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        skip(event.shiftKey ? -5 : -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        skip(event.shiftKey ? 5 : 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        seekTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        seekTo(totalDuration);
      } else if (key === "s") {
        event.preventDefault();
        splitAtPlayhead();
      } else if (key === "m") {
        event.preventDefault();
        setMuted((value) => !value);
      } else if (key === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (key === "escape") {
        setSelection(null);
        setTransitionMenu(null);
      } else if (event.key === "Backspace" || event.key === "Delete") {
        if (selection?.kind === "clip") {
          event.preventDefault();
          removeClip(selection.id);
        } else if (selection?.kind === "transition") {
          event.preventDefault();
          applyTransition("none");
        }
      }
    };
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const bgmLabel =
    BGM_CHOICES.find((choice) => choice.id === doc.bgm)?.label ?? "No music";
  const activeClipIndex = clipAtTime(currentTime);
  const activeClip =
    activeClipIndex !== null ? doc.sequence[activeClipIndex] : null;

  const transitionMenuMax =
    transitionMenuItem >= 0 ? maxTransitionForIndex(transitionMenuItem) : 0.1;
  const transitionMenuDuration = transitionMenuClip
    ? Math.min(transitionMenuClip.transitionDurationSec, transitionMenuMax)
    : 0.75;

  const canRender = doc.sequence.length > 0 && rendering === null;

  return (
    <div className="le-root">
      <input
        ref={importInputRef}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void importClips(files);
        }}
      />
      <header className="le-topbar">
        <div className="le-topbar-left">
          <Link
            href={initial.title === "Lumen Editor Demo" ? "/demo" : `/studio/${projectId}`}
            className="le-icon-btn"
            title="Back to storyboard"
            aria-label="Back to storyboard"
          >
            <IconArrowLeft size={17} />
          </Link>
          <div className="le-project">
            <span className="le-project-title">{initial.title}</span>
            <span className="le-project-meta">
              {doc.sequence.length} clips · {formatDuration(totalDuration)} ·{" "}
              {initial.aspect} · {initial.language.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="le-topbar-center">
          <button
            type="button"
            className={`le-icon-btn ${leftOpen ? "is-on" : ""}`}
            onClick={() => setLeftOpen((value) => !value)}
            title="Toggle media panel"
            aria-label="Toggle media panel"
            aria-pressed={leftOpen}
          >
            <IconPanelLeft />
          </button>
          <div className="le-history">
            <button
              type="button"
              className="le-icon-btn"
              onClick={undo}
              disabled={past.length === 0}
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              <IconUndo />
            </button>
            <button
              type="button"
              className="le-icon-btn"
              onClick={redo}
              disabled={future.length === 0}
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
            >
              <IconRedo />
            </button>
          </div>
          <span className={`le-state ${dirty ? "is-dirty" : ""}`}>
            <span className="le-state-dot" />
            {rendering
              ? rendering === "export"
                ? "Exporting"
                : autoRendering
                  ? "Updating preview"
                  : "Rendering"
              : dirty
                ? "Synced — updating shortly"
                : hasRender
                  ? "Preview synced"
                  : "Not rendered"}
          </span>
        </div>

        <div className="le-topbar-right">
          <button
            type="button"
            className="le-btn le-btn-primary le-btn-sm"
            onClick={() => {
              if (!dirty && hasRender && mergedVideoUrl) {
                triggerDownload(mergedVideoUrl);
                setNotice({
                  tone: "success",
                  text: "Download started.",
                  href: mergedVideoUrl,
                  hrefLabel: "Download again",
                });
              } else {
                void renderSequence("export");
              }
            }}
            disabled={!canRender}
          >
            <IconDownload size={15} />
            <span>{rendering === "export" ? "Exporting…" : "Export MP4"}</span>
          </button>
        </div>
      </header>

      <div className="le-body">
        {leftOpen && (
          <aside className="le-panel le-left">
            <div className="le-tabs" role="tablist" aria-label="Editor panels">
              <button
                type="button"
                className={`le-tab ${leftTab === "media" ? "is-active" : ""}`}
                onClick={() => setLeftTab("media")}
                role="tab"
                aria-selected={leftTab === "media"}
              >
                <IconFilm size={15} />
                Media
              </button>
              <button
                type="button"
                className={`le-tab ${leftTab === "audio" ? "is-active" : ""}`}
                onClick={() => setLeftTab("audio")}
                role="tab"
                aria-selected={leftTab === "audio"}
              >
                <IconMusic size={15} />
                Audio
              </button>
            </div>

            <div className="le-panel-scroll">
              {leftTab === "media" && (
                <>
                  <button
                    type="button"
                    className="le-import-btn"
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                  >
                    <span className="le-import-icon">
                      {importing ? (
                        <span className="le-spinner" />
                      ) : (
                        <IconUpload size={16} />
                      )}
                    </span>
                    <span className="le-import-copy">
                      <strong>{importing ? "Importing clips…" : "Import from device"}</strong>
                      <em>MP4, MOV or WebM</em>
                    </span>
                  </button>
                  <div className="le-search">
                    <IconSearch size={15} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search clips"
                      aria-label="Search clips"
                    />
                  </div>
                  <div className="le-media-list">
                    {mediaScenes.map((scene) => {
                      const used = doc.sequence.filter(
                        (item) => item.scene.id === scene.id
                      ).length;
                      const deleting = deletingSceneId === scene.id;
                      return (
                        <div
                          key={scene.id}
                          className={`le-media-card ${
                            scene.hasClip ? "" : "is-disabled"
                          } ${scene.editorOnly ? "is-editor-only" : ""}`}
                        >
                          <button
                            type="button"
                            className="le-media-select"
                            onClick={() => {
                              addScene(scene);
                            }}
                            disabled={!scene.hasClip}
                            title={
                              scene.hasClip
                                ? `Add ${sceneLabel(scene)} to the timeline`
                                : "This clip has not been generated yet"
                            }
                          >
                            <span className="le-thumb">
                              {scene.hasImage ? (
                                <img
                                  src={scenePosterUrl(projectId, scene, posterBust)}
                                  alt=""
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : null}
                              <span className="le-thumb-fallback">
                                {sceneBadge(scene)}
                              </span>
                            </span>
                            <span className="le-media-copy">
                              <span className="le-media-title">
                                {sceneBadge(scene)} · {scene.title}
                              </span>
                              <span className="le-media-sub">
                                {scene.hasClip
                                  ? scene.editorOnly
                                    ? `Imported · ${formatDuration(sceneSourceDuration(scene))}${used > 0 ? ` · ${used} in timeline` : ""}`
                                    : `${formatDuration(sceneSourceDuration(scene))} · clip ready${used > 0 ? ` · ${used} in timeline` : ""}`
                                  : "Clip not generated yet"}
                              </span>
                            </span>
                            <span className="le-media-action">
                              {scene.hasClip ? <IconPlus size={14} /> : <IconClock size={14} />}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="le-media-remove"
                            onClick={() => void removeSceneFromLibrary(scene)}
                            disabled={deletingSceneId !== null}
                            title={
                              scene.editorOnly
                                ? `Remove imported clip “${scene.title}”`
                                : `Hide “${scene.title}” from the editor`
                            }
                            aria-label={
                              scene.editorOnly
                                ? `Remove ${scene.title} from the editor`
                                : `Hide ${scene.title} from the editor`
                            }
                          >
                            {deleting ? (
                              <span className="le-spinner" />
                            ) : (
                              <IconMinus size={14} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                    {mediaScenes.length === 0 && (
                      <p className="le-empty-note">
                        {search.trim()
                          ? `No clips match “${search}”.`
                          : "No visible clips yet."}
                      </p>
                    )}
                  </div>

                  {hiddenScenes.length > 0 && (
                    <div className="le-hidden-list">
                      <div className="le-section-head">
                        <span>Hidden from editor</span>
                        <em>{hiddenScenes.length}</em>
                      </div>
                      {hiddenScenes.map((scene) => {
                        const restoring = restoringSceneId === scene.id;
                        return (
                          <div key={scene.id} className="le-hidden-row">
                            <span className="le-hidden-copy">
                              <strong>
                                {sceneBadge(scene)} · {scene.title}
                              </strong>
                              <em>Still on the storyboard</em>
                            </span>
                            <button
                              type="button"
                              className="le-hidden-restore"
                              onClick={() => void restoreSceneToLibrary(scene)}
                              disabled={restoringSceneId !== null}
                            >
                              {restoring ? (
                                <span className="le-spinner" />
                              ) : (
                                "Restore"
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p className="le-panel-foot">
                    Click a card to append it to the timeline. Imported clips stay
                    in the editor only; hiding a storyboard scene here does not
                    change the storyboard.
                  </p>
                </>
              )}

              {leftTab === "audio" && (
                <>
                  <p className="le-panel-intro">
                    Music is mixed under the narration at render time. Preview a
                    track here before you commit it.
                  </p>
                  <div className="le-bgm-list">
                    {BGM_CHOICES.map((choice) => {
                      const selected = doc.bgm === choice.id;
                      const audition = auditioning === choice.id;
                      return (
                        <div
                          key={choice.id}
                          className={`le-bgm-card ${selected ? "is-active" : ""}`}
                        >
                          <button
                            type="button"
                            className="le-bgm-audition"
                            onClick={() => {
                              if (choice.id === "none") {
                                stopAudition();
                                return;
                              }
                              toggleAudition(choice.id);
                            }}
                            title={audition ? "Stop preview" : "Preview track"}
                            aria-label={audition ? "Stop preview" : "Preview track"}
                            disabled={choice.id === "none"}
                          >
                            {audition ? <IconPause size={13} /> : <IconPlay size={13} />}
                          </button>
                          <button
                            type="button"
                            className="le-bgm-copy"
                            onClick={() => {
                              commit((current) => ({ ...current, bgm: choice.id }));
                              if (choice.id === "none") stopAudition();
                            }}
                          >
                            <span>{choice.label}</span>
                            <em>{choice.description}</em>
                          </button>
                          <span className="le-bgm-check">
                            {selected ? <IconCheck size={14} /> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="le-panel-section">
                    <div className="le-section-head">
                      <span>Music volume</span>
                      <em>{Math.round(doc.bgmVolume * 100)}%</em>
                    </div>
                    <input
                      type="range"
                      className="le-range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={doc.bgmVolume}
                      disabled={doc.bgm === "none"}
                      onPointerDown={snapshot}
                      onChange={(event) =>
                        updateLive((current) => ({
                          ...current,
                          bgmVolume: Number(event.target.value),
                        }))
                      }
                    />
                    <p className="le-panel-foot">
                      Narration stays at full level; music sits underneath.
                    </p>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}

        <main className="le-stage-wrap" ref={stageWrapRef}>
          <div className="le-stage">
            <div className="le-stage-top">
              <span className="le-stage-label">
                <span className="le-live-dot" />
                {activeClip ? sceneLabel(activeClip.scene) : "Program"}
              </span>
              <span className="le-stage-meta">
                {RESOLUTIONS[initial.aspect] ?? initial.aspect} · 30 fps
              </span>
              {dirty && hasRender && (
                <span
                  className={`le-stale-pill ${rendering === "preview" ? "is-busy" : ""}`}
                >
                  <IconRefresh size={12} />
                  {rendering === "preview"
                    ? "Updating preview…"
                    : "Preview will update automatically"}
                </span>
              )}
            </div>

            <div className="le-preview-area" ref={stageViewportRef}>
              <div className="le-preview" style={frameStyle}>
                {hasRender ? (
                  <video
                    ref={videoRef}
                    src={mergedVideoUrl}
                    poster={
                      initial.hasPoster || hasRender
                        ? `/api/projects/${projectId}/poster?t=${encodeURIComponent(posterBust)}`
                        : undefined
                    }
                    playsInline
                    preload="metadata"
                    onClick={togglePlay}
                    onDoubleClick={toggleFullscreen}
                  />
                ) : (
                  <div className="le-preview-empty">
                    <span className="le-preview-empty-icon">
                      <IconFilm size={30} />
                    </span>
                    <h3>
                      {doc.sequence.length > 0
                        ? "Preparing your preview"
                        : "Your timeline is empty"}
                    </h3>
                    <p>
                      {doc.sequence.length > 0
                        ? "Your preview updates automatically after every edit."
                        : "Import a clip from your device or add a scene from the Media panel."}
                    </p>
                    {doc.sequence.length === 0 && (
                      <button
                        type="button"
                        className="le-btn le-btn-outline le-btn-sm"
                        onClick={() => {
                          setLeftOpen(true);
                          setLeftTab("media");
                        }}
                      >
                        <IconPlus size={15} />
                        Open media
                      </button>
                    )}
                  </div>
                )}
                {autoRendering && (
                  <div className="le-preview-updating" role="status">
                    <span className="le-spinner" />
                    <span>Updating preview…</span>
                  </div>
                )}
                {showGuides && (
                  <div className="le-guides" aria-hidden="true">
                    <span className="le-guide-v le-guide-v1" />
                    <span className="le-guide-v le-guide-v2" />
                    <span className="le-guide-h le-guide-h1" />
                    <span className="le-guide-h le-guide-h2" />
                  </div>
                )}
                {scrubbing && hasRender && (
                  <span className="le-scrub-badge">
                    {formatTimecode(currentTime)}
                  </span>
                )}
              </div>
            </div>

            <div className="le-transport">
              <div className="le-transport-time">
                <span className="le-timecode">{formatTimecode(currentTime)}</span>
                <span className="le-time-divider">/</span>
                <span className="le-timecode is-soft">
                  {formatTimecode(effectiveTotal)}
                </span>
              </div>
              <div className="le-transport-center">
                <button
                  type="button"
                  className="le-icon-btn"
                  onClick={() => seekTo(0)}
                  disabled={!hasRender}
                  title="Go to start (Home)"
                  aria-label="Go to start"
                >
                  <IconSkipStart size={16} />
                </button>
                <button
                  type="button"
                  className="le-icon-btn"
                  onClick={() => skip(-1)}
                  disabled={!hasRender}
                  title="Back 1 second (←)"
                  aria-label="Back one second"
                >
                  <IconStepBack size={15} />
                </button>
                <button
                  type="button"
                  className="le-play-btn"
                  onClick={togglePlay}
                  disabled={!hasRender}
                  title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <IconPause size={16} /> : <IconPlay size={16} />}
                </button>
                <button
                  type="button"
                  className="le-icon-btn"
                  onClick={() => skip(1)}
                  disabled={!hasRender}
                  title="Forward 1 second (→)"
                  aria-label="Forward one second"
                >
                  <IconStepForward size={15} />
                </button>
                <button
                  type="button"
                  className="le-icon-btn"
                  onClick={() => seekTo(effectiveTotal)}
                  disabled={!hasRender}
                  title="Go to end (End)"
                  aria-label="Go to end"
                >
                  <IconSkipEnd size={16} />
                </button>
              </div>
              <div className="le-transport-right">
                <button
                  type="button"
                  className={`le-icon-btn ${loop ? "is-on" : ""}`}
                  onClick={() => setLoop((value) => !value)}
                  disabled={!hasRender}
                  title="Loop playback"
                  aria-label="Loop playback"
                  aria-pressed={loop}
                >
                  <IconLoop size={16} />
                </button>
                <button
                  type="button"
                  className="le-icon-btn"
                  onClick={() => setMuted((value) => !value)}
                  disabled={!hasRender}
                  title={muted ? "Unmute (M)" : "Mute (M)"}
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted || volume === 0 ? (
                    <IconVolumeMute size={16} />
                  ) : (
                    <IconVolume size={16} />
                  )}
                </button>
                <input
                  type="range"
                  className="le-volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setVolume(value);
                    setMuted(value === 0);
                  }}
                  aria-label="Volume"
                  disabled={!hasRender}
                />
                <span className="le-transport-sep" />
                <button
                  type="button"
                  className={`le-icon-btn ${showGuides ? "is-on" : ""}`}
                  onClick={() => setShowGuides((value) => !value)}
                  title="Toggle safe guides"
                  aria-label="Toggle safe guides"
                  aria-pressed={showGuides}
                >
                  <IconGrid size={16} />
                </button>
                <button
                  type="button"
                  className={`le-icon-btn ${isFullscreen ? "is-on" : ""}`}
                  onClick={toggleFullscreen}
                  title="Fullscreen (F)"
                  aria-label="Toggle fullscreen"
                >
                  <IconFullscreen size={16} />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <section className="le-timeline">
        <div className="le-tl-toolbar">
          <div className="le-tl-tools">
            <button
              type="button"
              className="le-tl-btn"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              title="Import a clip from your device"
            >
              <IconPlus size={14} />
              {importing ? "Importing…" : "Add clip"}
            </button>
            <button
              type="button"
              className="le-tl-btn"
              onClick={splitAtPlayhead}
              disabled={activeClip === null}
              title="Split at playhead (S)"
            >
              <IconScissors size={14} />
              Split
            </button>
            <button
              type="button"
              className="le-tl-btn"
              onClick={() => {
                if (selection?.kind === "clip") removeClip(selection.id);
                else if (selection?.kind === "transition") applyTransition("none");
              }}
              disabled={selection === null}
              title="Delete selection"
            >
              <IconTrash size={14} />
              Delete
            </button>
          </div>
          <div className="le-tl-readout">
            <IconClock size={13} />
            <span>{formatTimecode(currentTime)}</span>
            <span className="le-tl-readout-sep">/</span>
            <span>{formatTimecode(effectiveTotal)}</span>
          </div>
          <div className="le-tl-zoom">
            <button
              type="button"
              className="le-icon-btn"
              onClick={() => setPps((value) => clamp(value - 12, MIN_ZOOM, MAX_ZOOM))}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <IconMinus size={14} />
            </button>
            <input
              type="range"
              className="le-zoom-range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={1}
              value={pps}
              onChange={(event) => setPps(Number(event.target.value))}
              aria-label="Timeline zoom"
            />
            <button
              type="button"
              className="le-icon-btn"
              onClick={() => setPps((value) => clamp(value + 12, MIN_ZOOM, MAX_ZOOM))}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <IconPlus size={14} />
            </button>
            <button type="button" className="le-tl-btn" onClick={fitTimeline}>
              Fit
            </button>
          </div>
        </div>

        <div className="le-tl-body">
          <div className="le-tl-headers" aria-hidden="true">
            <div className="le-tl-ruler-head">TC</div>
            <div className="le-tl-track-head is-video">V1</div>
            <div className="le-tl-track-head is-audio">A1</div>
            <div className="le-tl-track-head is-music">M1</div>
          </div>

          <div className="le-tl-scroll" ref={timelineScrollRef}>
            <div
              className={`le-tl-content ${scrubbing ? "is-scrubbing" : ""}`}
              style={{ width: `${contentWidth}px` }}
              ref={timelineContentRef}
              onPointerDown={beginScrub}
            >
              <div className="le-ruler">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className="le-tick"
                    style={{ left: `${TL_PAD + tick * pps}px` }}
                  >
                    <em>{formatRuler(tick, tickStep)}</em>
                  </span>
                ))}
              </div>

              <div className="le-track le-track-video">
                {doc.sequence.length === 0 && (
                  <div className="le-track-empty">
                    Import a clip or add a scene from the Media panel.
                  </div>
                )}
                {doc.sequence.map((item, index) => {
                  const timing = geometry[index];
                  const layout = layoutGeometry[index];
                  if (!timing || !layout) return null;
                  const selected =
                    selection?.kind === "clip" && selection.id === item.instanceId;
                  return (
                    <div
                      key={item.instanceId}
                      className={`le-clip ${selected ? "is-selected" : ""} ${
                        draggingId === item.instanceId ? "is-dragging" : ""
                      } ${
                        trimDrag?.id === item.instanceId ? "is-trimming" : ""
                      }`}
                      style={{
                        left: `${TL_PAD + layout.start * pps}px`,
                        width: `${Math.max(26, layout.duration * pps)}px`,
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelection({ kind: "clip", id: item.instanceId });
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        seekTo(timing.start);
                      }}
                      draggable
                      onDragStart={(event) => {
                        if (
                          (event.target as HTMLElement).closest(
                            ".le-clip-handle"
                          )
                        ) {
                          event.preventDefault();
                          return;
                        }
                        setDraggingId(item.instanceId);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", item.instanceId);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId =
                          draggingId || event.dataTransfer.getData("text/plain");
                        if (sourceId) reorderClip(sourceId, item.instanceId);
                        setDraggingId(null);
                      }}
                      title={`${sceneLabel(item.scene)}: ${item.scene.title}`}
                    >
                      <span
                        className="le-clip-bg"
                        style={
                          item.scene.hasImage
                            ? {
                                backgroundImage: `url("${scenePosterUrl(projectId, item.scene, posterBust)}")`,
                              }
                            : undefined
                        }
                      />
                      <span className="le-clip-shade" />
                      <span className="le-clip-copy">
                        <em>{sceneBadge(item.scene)}</em>
                        <span>{item.scene.title}</span>
                      </span>
                      <span className="le-clip-duration">
                        {formatDuration(timing.duration)}
                      </span>
                      <span
                        className="le-clip-handle is-left"
                        role="separator"
                        aria-label={`Trim in point for ${item.scene.title}`}
                        title={`Drag to trim in · ${formatSeconds(
                          item.trimStartSec
                        )}`}
                        onPointerDown={(event) =>
                          beginTrim(event, item.instanceId, "start")
                        }
                      />
                      <span
                        className="le-clip-handle is-right"
                        role="separator"
                        aria-label={`Trim out point for ${item.scene.title}`}
                        title={`Drag to trim out · ${formatSeconds(
                          item.trimEndSec
                        )}`}
                        onPointerDown={(event) =>
                          beginTrim(event, item.instanceId, "end")
                        }
                      />
                      {trimDrag?.id === item.instanceId && (
                        <span className="le-clip-trim">
                          {formatSeconds(item.trimStartSec)} –{" "}
                          {formatSeconds(item.trimEndSec)}
                        </span>
                      )}
                    </div>
                  );
                })}

                {doc.sequence.map((item, index) => {
                  if (index >= doc.sequence.length - 1) return null;
                  const layout = layoutGeometry[index];
                  if (!layout) return null;
                  const boundary =
                    layout.start +
                    layout.duration -
                    layout.transitionDuration / 2;
                  const selected =
                    selection?.kind === "transition" &&
                    selection.id === item.instanceId;
                  return (
                    <button
                      type="button"
                      key={`cut-${item.instanceId}`}
                      className={`le-cut ${selected ? "is-selected" : ""} ${
                        item.transition === "none" ? "is-hard" : ""
                      }`}
                      style={{ left: `${TL_PAD + boundary * pps}px` }}
                      data-transition-trigger
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        openTransitionMenu(item.instanceId, event.currentTarget);
                      }}
                      title={
                        item.transition === "none"
                          ? "Add a transition between these clips"
                          : `${TRANSITIONS.find((transition) => transition.id === item.transition)?.label ?? item.transition} · click to change`
                      }
                      aria-label="Add or edit transition"
                    >
                      {item.transition === "none" ? (
                        <span className="le-cut-plus">
                          <IconPlus size={9} />
                        </span>
                      ) : (
                        <span className="le-cut-mark" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="le-track le-track-audio">
                {doc.sequence.map((item, index) => {
                  const layout = layoutGeometry[index];
                  if (!layout) return null;
                  return (
                    <div
                      key={`audio-${item.instanceId}`}
                      className="le-audio-clip"
                      style={{
                        left: `${TL_PAD + layout.start * pps}px`,
                        width: `${Math.max(26, layout.duration * pps)}px`,
                      }}
                      title={`Narration · ${sceneLabel(item.scene)}`}
                    >
                      <span className="le-wave" />
                      <span className="le-audio-label">
                        {sceneBadge(item.scene)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="le-track le-track-music">
                {doc.bgm !== "none" ? (
                  <div
                    className="le-music-clip"
                    style={{
                      left: `${TL_PAD}px`,
                      width: `${Math.max(26, totalDuration * pps)}px`,
                    }}
                  >
                    <span className="le-wave is-music" />
                    <span className="le-music-label">
                      <IconMusic size={11} />
                      {bgmLabel}
                    </span>
                  </div>
                ) : (
                  <div className="le-track-placeholder">
                    No music selected — add a bed from the Audio panel.
                  </div>
                )}
              </div>

              <div
                className="le-playhead"
                style={{ left: `${playheadX}px` }}
                aria-hidden="true"
              >
                <span className="le-playhead-handle" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {transitionMenu && transitionMenuClip && transitionMenuNext && (
        <div
          className={`le-transition-pop ${
            transitionMenu.placement === "below" ? "is-below" : ""
          }`}
          style={{
            left: `${transitionMenu.x}px`,
            top: `${transitionMenu.y}px`,
            maxHeight: `${transitionMenu.maxHeight}px`,
          }}
          role="dialog"
          aria-label={`Transition between ${sceneLabel(transitionMenuClip.scene)} and ${sceneLabel(transitionMenuNext.scene)}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="le-transition-pop-head">
            <div>
              <span className="le-kicker">Cut transition</span>
              <strong>
                {sceneLabel(transitionMenuClip.scene)} →{" "}
                {sceneLabel(transitionMenuNext.scene)}
              </strong>
            </div>
            <button
              type="button"
              className="le-icon-btn"
              onClick={() => setTransitionMenu(null)}
              aria-label="Close transition picker"
            >
              <IconX size={13} />
            </button>
          </div>
          <div className="le-transition-pop-grid">
            {TRANSITIONS.map((transition) => (
              <button
                type="button"
                key={transition.id}
                className={`le-transition-pop-item ${
                  transitionMenuClip.transition === transition.id
                    ? "is-active"
                    : ""
                }`}
                onClick={() =>
                  applyTransition(transition.id, transitionMenuClip.instanceId)
                }
              >
                <span className="le-transition-pop-glyph">
                  <TransitionGlyph type={transition.id} size={22} />
                </span>
                <span>{transition.label}</span>
                {transitionMenuClip.transition === transition.id && (
                  <IconCheck size={11} />
                )}
              </button>
            ))}
          </div>
          {transitionMenuClip.transition !== "none" && (
            <div className="le-transition-pop-duration">
              <div className="le-section-head">
                <span>Duration</span>
                <em>{formatSeconds(transitionMenuDuration)}</em>
              </div>
              <input
                type="range"
                className="le-range"
                min={0.1}
                max={transitionMenuMax}
                step={0.05}
                value={transitionMenuDuration}
                onPointerDown={snapshot}
                onChange={(event) =>
                  updateTransitionDuration(
                    transitionMenuClip.instanceId,
                    Number(event.target.value)
                  )
                }
              />
            </div>
          )}
          {transitionMenuClip.transition !== "none" && (
            <button
              type="button"
              className="le-transition-pop-remove"
              onClick={() => {
                applyTransition("none", transitionMenuClip.instanceId);
                setTransitionMenu(null);
              }}
            >
              <IconX size={12} />
              Remove transition
            </button>
          )}
        </div>
      )}

      {rendering && !autoRendering && (
        <div className="le-render-overlay" role="dialog" aria-modal="true">
          <div className="le-render-card">
            <span className="le-spinner" />
            <span className="le-kicker">
              {rendering === "export" ? "Export" : "Preview"}
            </span>
            <h3>
              {rendering === "export"
                ? "Rendering your film"
                : "Rendering preview"}
            </h3>
            <p>
              Stitching {doc.sequence.length} clips
              {doc.bgm !== "none" ? ` with ${bgmLabel.toLowerCase()} music` : ""}
              . Transitions and trims are being encoded now.
            </p>
            {renderError && <p className="le-render-error">{renderError}</p>}
            <button
              type="button"
              className="le-btn le-btn-outline le-btn-sm"
              onClick={cancelRender}
            >
              Cancel render
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className={`le-toast is-${notice.tone}`} role="status">
          <span className="le-toast-dot" />
          <span className="le-toast-text">{notice.text}</span>
          {notice.href && (
            <a
              href={notice.href}
              download={`${slugify(initial.title)}.mp4`}
              className="le-toast-link"
            >
              {notice.hrefLabel ?? "Download"}
            </a>
          )}
          <button
            type="button"
            className="le-toast-close"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <IconX size={12} />
          </button>
        </div>
      )}
    </div>
  );
}