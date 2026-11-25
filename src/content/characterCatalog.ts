import { publicAssetUrl } from "./assetPaths";
import type { CharacterManifest, WrestlerDocument, WrestlerSummary } from "./characterLook";

/**
 * Lazy asset loader for the modular Character Creator under
 * `public/assets/characters/creator/`.
 *
 * Nothing here is imported by the Main Menu chunk: everything loads on demand
 * when the Character Editor opens (or when Animation Viewer renders a saved
 * custom wrestler).
 */

export const CREATOR_ASSET_DIR = "assets/characters/creator/";

export interface CreatorRosterIndex {
  readonly version: number;
  readonly wrestlers: readonly string[];
  readonly summaries: readonly WrestlerSummary[];
}

export interface PreviewAnimationPreset {
  readonly id: string;
  readonly label: string;
  /** Path relative to public/assets/animations/, or null for pure VPG Rig 2.0 T-Pose. */
  readonly clip: string | null;
}

/** Curated VPG Rig 2.0 animations verified to exist under public/assets/animations/. */
export const CREATOR_PREVIEW_ANIMATIONS: readonly PreviewAnimationPreset[] = [
  { id: "stance-0", label: "Idle Stance 1", clip: "shared/standing/stances/standing-movement-style-0.glb" },
  { id: "stance-1", label: "Idle Stance 2", clip: "shared/standing/stances/standing-movement-style-1.glb" },
  { id: "stance-2", label: "Idle Stance 3", clip: "shared/standing/stances/standing-movement-style-2.glb" },
  { id: "stance-3", label: "Idle Stance 4", clip: "shared/standing/stances/standing-movement-style-3.glb" },
  { id: "stance-4", label: "Idle Stance 5", clip: "shared/standing/stances/standing-movement-style-4.glb" },
  { id: "stance-5", label: "Idle Stance 6", clip: "shared/standing/stances/standing-movement-style-5.glb" },
  { id: "stance-6", label: "Idle Stance 7", clip: "shared/standing/stances/standing-movement-style-6.glb" },
  { id: "walk-forward", label: "Walk Forward", clip: "shared/standing/walking/walk-forward.glb" },
  { id: "dazed", label: "Dazed Stance", clip: "shared/standing/stances/dazed-on-the-feet-kind-1.glb" },
  { id: "t-pose", label: "T-Pose (VPG Rig 2.0 Rest)", clip: null },
];

export function creatorAssetUrl(relativePath: string): string {
  const isGlb = /\.glb$/i.test(relativePath);
  const base = isGlb ? import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL : import.meta.env.BASE_URL;
  return publicAssetUrl(`${CREATOR_ASSET_DIR}${relativePath}`, base);
}

let manifestPromise: Promise<CharacterManifest> | null = null;
let rosterPromise: Promise<CreatorRosterIndex> | null = null;
const wrestlerCache = new Map<string, Promise<WrestlerDocument>>();

export function loadCreatorManifest(): Promise<CharacterManifest> {
  manifestPromise ??= (async () => {
    const url = creatorAssetUrl("manifest.json");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Character manifest could not be loaded (${response.status})`);
    return (await response.json()) as CharacterManifest;
  })().catch((err) => {
    manifestPromise = null;
    throw err;
  });
  return manifestPromise;
}

export function loadCreatorRoster(): Promise<CreatorRosterIndex> {
  rosterPromise ??= (async () => {
    const url = creatorAssetUrl("roster.json");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Character roster could not be loaded (${response.status})`);
    return (await response.json()) as CreatorRosterIndex;
  })().catch((err) => {
    rosterPromise = null;
    throw err;
  });
  return rosterPromise;
}

export function loadBundledWrestler(id: string): Promise<WrestlerDocument> {
  let pending = wrestlerCache.get(id);
  if (!pending) {
    pending = (async () => {
      const url = creatorAssetUrl(`wrestlers/${id}.json`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Wrestler "${id}" could not be loaded (${response.status})`);
      return (await response.json()) as WrestlerDocument;
    })().catch((err) => {
      wrestlerCache.delete(id);
      throw err;
    });
    wrestlerCache.set(id, pending);
  }
  return pending;
}
