/**
 * Director / Critic system prompts, ported from the reference Python repo and
 * made language- and region-configurable. Bengali + West Bengal remain the
 * defaults; the same rules (no lip-sync, timing margins, local grounding,
 * on-screen micro-prompting, factual accuracy) apply in any setting.
 */

export type VoicePersona = "formal_broadcaster" | "empathetic_mentor" | "youth_beneficiary";

export interface VoicePersonaInfo {
  id: VoicePersona;
  label: string;
  badge: string;
  description: string;
  promptVoiceTone: string;
  scriptDelivery: string;
}

export const VOICE_PERSONAS: Record<VoicePersona, VoicePersonaInfo> = {
  formal_broadcaster: {
    id: "formal_broadcaster",
    label: "Formal Government Broadcaster",
    badge: "🏛️ Deep & Authoritative",
    description: "Deep, authoritative, informative, and credible public-service delivery.",
    promptVoiceTone: "deep, authoritative, formal, and trustworthy government public broadcaster tone",
    scriptDelivery: "Authoritative, dignified, and precise public-service announcement delivery with clarity and national stature.",
  },
  empathetic_mentor: {
    id: "empathetic_mentor",
    label: "Empathetic Mentor / Teacher",
    badge: "🎓 Warm & Reassuring",
    description: "Warm, reassuring, inspiring, and supportive guidance.",
    promptVoiceTone: "warm, reassuring, empathetic, gentle, and encouraging mentor tone",
    scriptDelivery: "Warm, reassuring, and caring delivery like an inspiring teacher or family elder counseling a student.",
  },
  youth_beneficiary: {
    id: "youth_beneficiary",
    label: "Youth Beneficiary / Student",
    badge: "⚡ Energetic & Relatable",
    description: "Energetic, relatable, optimistic, and peer-to-peer connection.",
    promptVoiceTone: "energetic, relatable, youthful, optimistic, and conversational peer tone",
    scriptDelivery: "Vibrant, optimistic, relatable peer-to-peer delivery expressing excitement, ambition, and relief.",
  },
};

export const DEFAULT_VOICE_PERSONA: VoicePersona = "formal_broadcaster";

export function getVoicePersona(tone?: string | null): VoicePersonaInfo {
  if (tone && tone in VOICE_PERSONAS) {
    return VOICE_PERSONAS[tone as VoicePersona];
  }
  return VOICE_PERSONAS[DEFAULT_VOICE_PERSONA];
}

export interface PromptSettings {
  /** bn | en | hi | … */
  language: string;
  /** Display name of the language, e.g. "Bengali". */
  languageLabel: string;
  /** e.g. "West Bengal" */
  region: string;
  /** e.g. "Bengali students and parents" — who the narration address. */
  audience: string;
  /** e.g. "Presidency University, Jadavpur University" — local grounding pool */
  localInstitutions: string;
  sceneCount: number;
  aspect: string;
  tone: string;
  persona: VoicePersonaInfo;
}

export const LANGUAGE_LABELS: Record<string, string> = {
  bn: "Bengali",
  en: "English",
  hi: "Hindi",
};

export function promptSettings(input: {
  language?: string | null;
  region?: string | null;
  sceneCount?: number;
  aspect?: string | null;
  tone?: string | null;
}): PromptSettings {
  const language = input.language || "bn";
  const persona = getVoicePersona(input.tone);
  return {
    language,
    languageLabel: LANGUAGE_LABELS[language] ?? "English",
    region: input.region || "West Bengal",
    audience:
      language === "bn"
        ? "ordinary people across West Bengal — students, parents, and citizens"
        : `ordinary people in ${input.region || "the region"} — students, parents, and families`,
    localInstitutions:
      input.region === "West Bengal" || !input.region
        ? "Presidency University, Jadavpur University, Calcutta University, National Library Kolkata, Bikash Bhavan, St. Xavier's College Kolkata"
        : `${input.region}'s premier public universities, libraries, district administrative centers, and landmarks`,
    sceneCount: Math.min(8, Math.max(4, Number(input.sceneCount) || 6)),
    aspect: input.aspect || "16:9",
    tone: persona.id,
    persona,
  };
}

export function getSceneSequenceGuideline(count: number): string {
  switch (count) {
    case 4:
      return `
   - Scene 1: Scheme Overview & Core Purpose (Opening hook, citizen aspiration, government vision)
   - Scene 2: Primary Financial & Resource Benefits (Exact subsidies, grants, coverage amounts)
   - Scene 3: Eligibility & Beneficiary Categories (Who qualifies, income limits, criteria)
   - Scene 4: Required Documents, Application Steps & Official Portal (Helpline & call-to-action)
`;
    case 5:
      return `
   - Scene 1: Inspiring Opening Hook & Scheme Vision (Real-world citizen context)
   - Scene 2: Key Financial Benefits & Support Breakdown (Subsidies, allowances, resources)
   - Scene 3: Target Beneficiaries & Eligibility Rules (Qualifications, quotas, criteria)
   - Scene 4: Document Checklist & Application Submission (Step-by-step guidance)
   - Scene 5: Official Government Portal, Timelines & Helplines (Empowering call-to-action)
`;
    case 7:
      return `
   - Scene 1: Powerful Opening Hook & State/National Vision (Citizen aspirations)
   - Scene 2: Comprehensive Scheme Introduction & Scope (Department, targeted demographic)
   - Scene 3: Direct Financial Benefits & Grant Breakdown (Exact monetary assistance)
   - Scene 4: Beneficiary Categories & Strict Eligibility Criteria (Income ceilings, rules)
   - Scene 5: Mandatory Documentation Preparation Checklist (Certificates, papers)
   - Scene 6: Step-by-Step Online Portal Application Procedure (Form registration walk-through)
   - Scene 7: Official Government Portal, Helplines & Final Call-to-Action
`;
    case 8:
      return `
   - Scene 1: Inspiring Opening Hook & Citizen Narrative (Aspirational everyday setting)
   - Scene 2: Scheme Vision, Purpose & Government Nodal Body (Broad overview)
   - Scene 3: Comprehensive Financial Assistance & Subsidy Breakdown (Exact amounts)
   - Scene 4: Strict Eligibility Criteria & Qualifying Categories (Income, age, merit rules)
   - Scene 5: Essential Document Checklist & Pre-Application Preparation (Required papers)
   - Scene 6: Step-by-Step Online Portal Registration & Application Walkthrough (Submission)
   - Scene 7: Verification, Tracking & Direct Benefit Transfer Process (Timeline & disbursal)
   - Scene 8: Official Portal URL, Helpline Contacts & Final Inspiring Call-to-Action
`;
    case 6:
    default:
      return `
   - Scene 1: Scheme Overview (Title, purpose, vision, citizen hook)
   - Scene 2: Benefits & Support Amount (Exact financial assistance or resources)
   - Scene 3: Eligibility Criteria (Who qualifies, income ceilings, merit)
   - Scene 4: Required Documents (Mandatory papers and verification items)
   - Scene 5: Step-by-Step How to Apply (Online/offline registration process)
   - Scene 6: Helpline Desk & Official Portal Call-to-Action (Final takeaway)
`;
  }
}

export function buildSceneSystemPrompt(settings: PromptSettings): string {
  const aspectInstruction =
    settings.aspect === "9:16"
      ? "VERTICAL (9:16) COMPOSITION (Reels / Shorts / TikTok): Frame all scene visual prompts strictly for vertical portrait composition. Keep key human subjects, actions, and objects centered in the middle vertical corridor so nothing is cut off on mobile phone screens."
      : settings.aspect === "1:1"
      ? "SQUARE (1:1) COMPOSITION: Frame all scene visual prompts for balanced 1:1 square composition."
      : "WIDESCREEN (16:9) COMPOSITION: Frame all scene visual prompts in cinematic horizontal widescreen 16:9.";

  return `
You are an expert Video Director and Prompt Engineer for Government Welfare Schemes.
Your task is to transform official government scheme documents into a broadcast-quality video storyboard consisting of EXACTLY ${settings.sceneCount} SCENES.

MANDATORY RULES & CONSTRAINTS:

1. STRICT SCENE COUNT COMPLIANCE (NON-NEGOTIABLE):
   - You MUST generate EXACTLY ${settings.sceneCount} scenes.
   - The "scenes" array in your JSON output MUST contain EXACTLY ${settings.sceneCount} items (scene_number 1 through ${settings.sceneCount}).
   - DO NOT stop at 5 or 6 scenes when ${settings.sceneCount} are requested. Every scene must be complete and unique.

2. NARRATIVE SCENE STRUCTURE (${settings.sceneCount} scenes):
${getSceneSequenceGuideline(settings.sceneCount)}

3. STRICT DOCUMENT ADHERENCE (NO HALLUCINATIONS):
   - Base all facts (amounts, eligibility, documents, portal names) strictly on the provided scheme document.
   - DO NOT substitute the scheme with any other scheme.

4. USER CREATIVE DIRECTIVES & STORYBOARD NOTES (HIGHEST PRIORITY):
   - If the user provides custom notes for visual tone, specific people to feature (e.g. female students, rural farmers, elderly citizens), locations/settings to show, or do's and don'ts, YOU MUST EXPLICITLY REFLECT THEM in the visual prompts, camera directions, and scene narrative.

5. ASPECT RATIO & CAMERA FRAMING:
   - Target Aspect Ratio: ${settings.aspect}.
   - ${aspectInstruction}
   - In every scene's "visual_prompt" and "camera_angle", explicitly incorporate framing for ${settings.aspect}.

6. ABSOLUTELY NO LIP-SYNC:
   - The video MUST NEVER show any human face talking or moving lips in sync with speech.
   - All characters are shown in natural candid action. The narration is strictly a voice-over (VO).

7. REGIONAL VISUAL GROUNDING (${settings.region}):
   - Visual settings must be authentic to ${settings.region} (architecture, recognizable landmarks such as ${settings.localInstitutions}, regional attire, everyday life).

8. AUDIO & NARRATION:
   - Voice Persona: ${settings.persona.label} (${settings.persona.badge}).
   - Voice Style: ${settings.persona.scriptDelivery}
   - Narration starts at 1.0s or 1.2s. Ends at 8.0s to 8.5s (leaving at least 1.5s silent buffer before scene transitions).
   - Voiceover MUST be in natural, everyday ${settings.languageLabel}, spoken with a ${settings.persona.promptVoiceTone}.

9. HIGHLY DETAILED VISUAL PROMPT STRUCTURE:
   The "visual_prompt" string for EACH scene MUST follow this EXACT multi-section layout:
   Create a 10-second photorealistic, cinematic government awareness video scene about [Topic].
   SCENE PURPOSE: [Detailed purpose]
   VISUAL SETTING: [Detailed setting in ${settings.region}, framed for ${settings.aspect}]
   VISUAL SEQUENCE: [Detailed shot-by-shot progression]
   USER NOTES APPLIED: [How the user's custom visual tone/notes are reflected in this scene]
   NARRATION: The narration MUST be spoken entirely in ${settings.languageLabel}. Use this EXACT narration: "[${settings.languageLabel} text]"
   VOICE: Natural ${settings.languageLabel} voice. Persona: ${settings.persona.label} (${settings.persona.promptVoiceTone}).
   AUDIO: ${settings.languageLabel} narration primary, subtle ambient background.
   ON-SCREEN TEXT: [List short key highlight bullet phrases and figures in CLEAR ENGLISH, e.g. "75% Credit Guarantee", "Up to ₹7.5 Lakh", "3% Interest Subvention"]
   CAMERA: [Detailed camera framing for ${settings.aspect}]
   CHARACTER CONSISTENCY: Realistic ${settings.region} citizens and beneficiaries in everyday clothing.
   VISUAL STYLE: Photorealistic, cinematic documentary. No anime, no CGI avatars.
   SYNCHRONIZATION: Visuals correspond to narration with zero character speaking.
   FACTUAL CONSTRAINTS: [Facts from document — amounts, percentages, deadlines]
   NEGATIVE CONSTRAINTS: No talking heads, no lip sync, no distorted text, no watermarks.
   (Do NOT include internal meta notes or "FINAL PRIORITY" instructions inside the visual prompt itself).

You must respond ONLY with a valid JSON object matching the exact schema specified.
`.trim();
}

export function buildSceneUserPrompt(input: {
  schemeText: string;
  additionalNotes?: string | null;
  images?: { filename: string }[];
  languageLabel: string;
  region: string;
  sceneCount: number;
  aspect: string;
  persona?: VoicePersonaInfo;
}): string {
  const numImages = input.images?.length ?? 0;
  const imgNote =
    numImages > 0
      ? `\n🖼️ VISUAL GROUNDING & REFERENCE PHOTOS ATTACHED (${numImages} image(s): ${input.images
          ?.map((img) => img.filename)
          .join(", ")}):
- You MUST carefully examine the visual details, architectural cues, building facades, uniforms, logos, and regional landmarks present in these uploaded reference photos.
- In any scene depicting institutions, beneficiary registration, classroom environments, or government centers, explicitly instruct the camera and visual prompt to match the uploaded reference visuals!
- Tag referenced scenes by noting specific visual elements from "${input.images?.map((img) => img.filename).join(", ")}" in "wb_grounding_elements".`
      : "";

  return `
============================================================
🎯 MANDATORY EXECUTION REQUIREMENTS:
1. EXACT SCENE COUNT: You MUST return EXACTLY ${input.sceneCount} scenes in the "scenes" array (scene_number 1 to ${input.sceneCount}). Do not return 5 or 6 scenes if ${input.sceneCount} are requested.
2. TARGET ASPECT RATIO: ${input.aspect} (frame all visual prompts and camera shots for ${input.aspect}).
3. REGION / CONTEXT: ${input.region}.
4. NARRATION LANGUAGE: ${input.languageLabel}.
5. VOICE PERSONA & TONE: ${input.persona?.label ?? "Formal Government Broadcaster"} (${input.persona?.promptVoiceTone ?? "deep, authoritative, formal"}).
============================================================

============================================================
⭐ USER'S CUSTOM STORYBOARD NOTES & VISUAL DIRECTIVES (TOP PRIORITY):
${input.additionalNotes?.trim() ? input.additionalNotes.trim() : "None specified. Apply authentic regional documentary styling."}
============================================================
⚠️ MANDATORY: If the user provided custom notes above (e.g. visual tone, specific people to feature, specific locations to show, do's and don'ts), YOU MUST REFLECT THEM PROMINENTLY in the visual prompts and scene direction!

SCHEME DOCUMENT TO CONVERT:
"""
${input.schemeText}
"""
${imgNote}

NUMBER OF GROUNDING IMAGES ATTACHED: ${numImages}

Please generate the complete video project plan strictly adhering to all guidelines. Do NOT hallucinate scheme details; use ONLY the provided document exactly as written.

REQUIRED SCENE OUTLINE TO IMPLEMENT (${input.sceneCount} scenes):
${getSceneSequenceGuideline(input.sceneCount)}

JSON SCHEMA TO RETURN (MUST CONTAIN AN ARRAY OF EXACTLY ${input.sceneCount} SCENES):
{
  "is_valid_scheme": true,
  "error_message": "Leave empty if valid. If the document is garbage, set is_valid_scheme to false and explain why here.",
  "scheme_title": "Full name of the scheme EXACTLY as in document",
  "total_duration_seconds": ${input.sceneCount * 10},
  "global_guidelines": "Core directorial guidelines covering tone, audio pacing, ${input.aspect} composition, and user custom notes",
  "detected_grounding_references": ["List of local institutions or uploaded landmarks referenced"],
  "scenes": [
    // MUST contain exactly ${input.sceneCount} scene objects (from scene_number 1 up to ${input.sceneCount}):
    {
      "scene_number": 1,
      "scene_title": "Scene 1 Title",
      "duration_seconds": 10.0,
      "visual_prompt": "Create a 10-second photorealistic, cinematic government awareness video scene.\\nSCENE PURPOSE: [Detailed scene objective]\\nVISUAL SETTING: [Authentic setting in ${input.region}, framed for ${input.aspect}]\\nVISUAL SEQUENCE: [Detailed shot-by-shot progression]\\nUSER NOTES APPLIED: [How user directives are reflected]\\nNARRATION: \\\"[Exact ${input.languageLabel} voiceover]\\\"\\nVOICE: Natural ${input.languageLabel} voice. Tone: formal, informative, and warm.\\nAUDIO: ${input.languageLabel} narration primary, subtle ambient background sound.\\nON-SCREEN TEXT: [List short key highlight bullet phrases and figures in CLEAR ENGLISH, e.g. \\\"75% Credit Guarantee\\\", \\\"Up to ₹7.5 Lakh\\\"]\\nCAMERA: [Detailed camera framing strictly for ${input.aspect} composition]\\nCHARACTER CONSISTENCY: Realistic ${input.region} citizens and beneficiaries in everyday clothing.\\nVISUAL STYLE: Photorealistic, cinematic documentary B-roll in ${input.aspect}.\\nNEGATIVE CONSTRAINTS: No talking heads, no lip sync, no distorted text, no watermarks.",
      "camera_angle": "E.g., Wide establishing shot framed for ${input.aspect}...",
      "voiceover_bengali": "${input.languageLabel} voiceover script",
      "narration_start_second": 1.0,
      "narration_end_second": 8.2,
      "onscreen_text": ["Key highlight in English 1", "Key highlight in English 2"],
      "wb_grounding_elements": ["Specific local visual cues"],
      "no_lip_sync_enforcement": "Reason why no lip sync occurs"
    }
    // ... Repeat for scene_number 2, 3, ... through ${input.sceneCount}. You MUST output all ${input.sceneCount} scenes!
  ]
}
`.trim();
}

export function buildCriticSystemPrompt(settings: PromptSettings): string {
  return `
You are an expert AI Video Quality Inspector & Chief Director for ${settings.region} government media productions.
Your mission is to perform a rigorous audit on generated video prompts and refine them to 100% compliance.

INSPECTION CHECKLIST:
1. [LIP-SYNC AUDIT]: Check if any prompt portrays a human talking to the camera or moving lips in sync with speech.
   - VIOLATION: Character talking to camera, speaking into mic, or mouth moving.
   - CORRECTION: Convert to candid documentary B-roll (wide shot, over-the-shoulder, looking at laptop, walking, studying, library stacks) with narrator as third-person voiceover.
2. [GROUNDING & IMAGES]:
   - VIOLATION: Generic unspecified places or landmarks outside the region.
   - CORRECTION: Replace with specific ${settings.region} institutions/landmarks (${settings.localInstitutions}) or incorporate uploaded reference photos if specified.
3. [TIMING MARGIN AUDIT]:
   - For every 10s scene: narration MUST start at >= 1.0s (e.g. 1.0s or 1.2s).
   - Narration MUST end at <= 8.5s (leaving at least 1.5s to 2.0s silent buffer for clean audio stitching).
   - Spoken ${settings.languageLabel} word count must fit within 6 to 7.2 seconds (approx 16-24 words).
4. [NATURAL EVERYDAY LANGUAGE]:
   - VIOLATION: Stiff syntax, textbook grammar errors, or machine-translated literal phrases.
   - CORRECTION: Convert to natural, modern everyday ${settings.languageLabel} spoken by ${settings.audience} that they immediately understand.
5. [MICRO-PROMPTING FOR ON-SCREEN TEXT IN ENGLISH]:
   - CRITICAL REQUIREMENT: All on-screen text highlights must be in CLEAR ENGLISH (e.g. "60% Marks Required", "₹2.5 Lakh Income Ceiling", "75% Credit Guarantee", "svmcm.wbhed.gov.in"), NOT in regional script, to avoid visual distortion in video diffusion models. Spoken voiceover remains strictly in ${settings.languageLabel}.
6. [DOCUMENT FACTUAL ACCURACY]:
   - Confirm benefits, income ceiling, marks criteria, and helpline numbers match the original scheme text.
7. [SCENE COUNT & NOTES RETENTION]:
   - The input storyboard contains ${settings.sceneCount} scenes. You MUST retain and return EXACTLY ${settings.sceneCount} scenes in "refined_scenes" (scene_number: 1 to ${settings.sceneCount}).
   - DO NOT drop, delete, or merge scenes. Every scene must be audited and returned.
   - Preserve framing for ${settings.aspect} and any user creative directives.
8. [PRESERVE DETAILED MULTI-SECTION VISUAL PROMPT STRUCTURE]:
   - The "visual_prompt" for each scene MUST retain the full professional multi-section breakdown:
     SCENE PURPOSE:, VISUAL SETTING:, VISUAL SEQUENCE:, USER NOTES APPLIED:, NARRATION:, VOICE:, AUDIO:, ON-SCREEN TEXT:, CAMERA:, CHARACTER CONSISTENCY:, VISUAL STYLE:, NEGATIVE CONSTRAINTS:.
   - DO NOT collapse "visual_prompt" into a simple 1 or 2 sentence summary! Keep all structured headings intact!
   - Do NOT include internal meta notes or "FINAL PRIORITY" instructions inside the visual prompt itself.

You must return a JSON response containing:
- compliance_score: integer 0-100
- passed_checks: boolean (true if compliance_score >= 90)
- issues_found: list of identified issues and their resolutions
- summary_notes: concise audit overview
- refined_scenes: fully corrected list of exactly ${settings.sceneCount} scenes with complete structured visual prompts
`.trim();
}

export function buildCriticUserPrompt(input: {
  schemeText: string;
  groundingNotes?: string | null;
  currentPlanJson: string;
}): string {
  return `
ORIGINAL SCHEME DOCUMENT TEXT:
"""
${input.schemeText}
"""

GROUNDING NOTES / DETECTED ASSETS:
${input.groundingNotes || "Regional educational and institutional grounding."}

PROPOSED VIDEO PROJECT PLAN TO AUDIT:
"""
${input.currentPlanJson}
"""

Please audit every scene meticulously, record all defects/improvements, and output the refined compliant scenes.
IMPORTANT: You MUST keep the full multi-section layout for every "visual_prompt" (SCENE PURPOSE:, VISUAL SETTING:, VISUAL SEQUENCE:, USER NOTES APPLIED:, NARRATION:, VOICE:, AUDIO:, ON-SCREEN TEXT:, CAMERA:, CHARACTER CONSISTENCY:, VISUAL STYLE:, NEGATIVE CONSTRAINTS:). Do not compress it into a short blurb, and do NOT include "FINAL PRIORITY:" or meta instructions in the visual prompt!

JSON SCHEMA TO RETURN:
{
  "compliance_score": 95,
  "passed_checks": true,
  "summary_notes": "Detailed review summary...",
  "issues_found": [
    {
      "scene_number": 1,
      "category": "timing_margin",
      "severity": "warning",
      "description": "Narration start was at 0.5s which risked audio overlap upon scene stitching.",
      "resolution": "Shifted narration start to 1.0s and trimmed 2 words to finish cleanly at 8.0s."
    }
  ],
  "NOTE_severity_must_be_exactly_one_of": ["info", "warning", "error"],
  "refined_scenes": [
    {
      "scene_number": 1,
      "scene_title": "Scene 1 Title",
      "duration_seconds": 10.0,
      "visual_prompt": "SCENE PURPOSE: ...\\nVISUAL SETTING: ...\\nVISUAL SEQUENCE: ...\\nUSER NOTES APPLIED: ...\\nNARRATION: ...\\nVOICE: ...\\nAUDIO: ...\\nON-SCREEN TEXT: [English bullet highlights]\\nCAMERA: ...\\nCHARACTER CONSISTENCY: ...\\nVISUAL STYLE: ...\\nNEGATIVE CONSTRAINTS: ...",
      "camera_angle": "Camera angle...",
      "voiceover_bengali": "Natural everyday conversational voiceover in the project language...",
      "narration_start_second": 1.0,
      "narration_end_second": 8.0,
      "onscreen_text": ["Key highlight in English 1", "Key highlight in English 2"],
      "wb_grounding_elements": ["Local landmarks"],
      "no_lip_sync_enforcement": "Explicit rule description"
    }
  ]
}
`.trim();
}

/**
 * Programmatic guarantee: ensures a visual prompt contains all required
 * professional broadcast sections (audio, setting, on-screen text display, etc.)
 * even if the model or critic produced a brief summary.
 */
export function formatRichVisualPrompt(
  scene: {
    scene_title: string;
    visual_prompt: string;
    camera_angle?: string | null;
    voiceover_bengali?: string | null;
    onscreen_text?: string[] | null;
    wb_grounding_elements?: string[] | null;
    no_lip_sync_enforcement?: string | null;
  },
  settings: {
    region: string;
    aspect: string;
    languageLabel: string;
    additionalNotes?: string | null;
    persona?: VoicePersonaInfo | null;
  }
): string {
  // Strip any accidental FINAL PRIORITY or meta-instruction lines from prompt
  const current = scene.visual_prompt
    .replace(/(?:^|\n)\s*FINAL PRIORITY:[\s\S]*$/i, "")
    .trim();

  // If it already contains the detailed multi-section headings, keep it intact
  const hasSections =
    current.includes("SCENE PURPOSE:") &&
    current.includes("VISUAL SETTING:") &&
    (current.includes("AUDIO:") || current.includes("VOICE:"));

  if (hasSections) {
    return current;
  }

  const purpose = scene.scene_title || "Scheme information";
  const setting =
    scene.wb_grounding_elements && scene.wb_grounding_elements.length > 0
      ? `${scene.wb_grounding_elements.join(", ")}, ${settings.region}`
      : `Authentic setting in ${settings.region}`;
  const camera = scene.camera_angle || `Framed for ${settings.aspect}`;
  const narration = scene.voiceover_bengali
    ? `"${scene.voiceover_bengali}"`
    : "Informative voiceover.";
  const onscreen =
    scene.onscreen_text && scene.onscreen_text.length > 0
      ? scene.onscreen_text.join(" · ")
      : "Key scheme highlights";
  const notesApplied =
    settings.additionalNotes?.trim() || "Authentic regional documentary styling";
  const negative =
    scene.no_lip_sync_enforcement || "No talking heads, no lip sync, no distorted text.";
  const personaDesc = settings.persona
    ? `${settings.persona.label} (${settings.persona.promptVoiceTone})`
    : "Formal Government Broadcaster (deep, authoritative, formal)";

  return [
    `Create a 10-second photorealistic, cinematic government awareness video scene.`,
    `SCENE PURPOSE: ${purpose}`,
    `VISUAL SETTING: ${setting}, framed for ${settings.aspect}.`,
    `VISUAL SEQUENCE: ${current}`,
    `USER NOTES APPLIED: ${notesApplied}`,
    `NARRATION: ${narration}`,
    `VOICE: Natural ${settings.languageLabel} voice. Persona: ${personaDesc}.`,
    `AUDIO: ${settings.languageLabel} narration primary, subtle ambient background sound.`,
    `ON-SCREEN TEXT: ${onscreen}`,
    `CAMERA: ${camera}`,
    `CHARACTER CONSISTENCY: Realistic ${settings.region} beneficiaries in authentic everyday clothing.`,
    `VISUAL STYLE: Photorealistic, cinematic documentary B-roll in ${settings.aspect}.`,
    `NEGATIVE CONSTRAINTS: ${negative}`,
  ].join("\n");
}