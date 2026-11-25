import { type ArenaData, arenaById, isBundledArena, publishUserArenas } from "@/content/arenas";
import { type ArenaDraft, parseDraft } from "@/content/arenaDraft";
import { type ImageScope, validateArena } from "@/content/arenaValidation";
import { resolveArenaPiece } from "@/content/arenaPieces";
import { currentAssetPath } from "@/content/assetPaths";
import { referencedImages } from "./images";
import { readJson, removeSavedValue, writeJsonOrThrow } from "./storage";

/**
 * Player arenas and the editor's unfinished draft, kept in localStorage.
 *
 * Arenas are a couple of KB of JSON each, so they sit beside the other
 * preferences; imported images (much larger) live in IndexedDB instead - see
 * imageStore.ts. Everything read back is validated, and an arena that no
 * longer validates (a bundled texture was renamed, say) is skipped with a
 * console warning rather than breaking the menus.
 */

export const ARENAS_KEY = "vpg-arenas";
export const DRAFT_KEY = "vpg-arena-draft";

/** Keeps the store from growing without bound in one origin's storage quota. */
export const MAX_USER_ARENAS = 100;

interface StoredArenas {
  version: 1;
  arenas: ArenaData[];
}

/** An editor draft parked for recovery after a reload. */
export interface ArenaRecovery {
  /** The saved arena being edited, or null while creating a new one. */
  editingId: string | null;
  draft: ArenaDraft;
}

let arenas: ArenaData[] = [];

/** Replaces only model references, preserving the rest of a validated save. */
function withPieceIds(arena: ArenaData): ArenaData {
  const normalized = { ...arena };
  for (const kind of ["floor", "barricade", "outer"] as const) {
    const reference = arena[kind];
    if (reference !== undefined) normalized[kind] = resolveArenaPiece(kind, reference)?.id ?? reference;
  }
  return normalized;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Points textures saved under a since-moved asset folder at where they live
 * now, before validation would reject them. Returns the same object when
 * nothing moved, so callers can tell whether the save needs rewriting.
 */
function withCurrentTextures(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let out = value;
  for (const map of ["arenaTextures", "ringTextures"]) {
    const textures = value[map];
    if (!isRecord(textures)) continue;
    const current = Object.fromEntries(
      Object.entries(textures).map(([key, path]) => [key, typeof path === "string" ? currentAssetPath(path) : path])
    );
    if (Object.keys(current).some((key) => current[key] !== textures[key])) out = { ...out, [map]: current };
  }
  return out;
}

function readStored(): ArenaData[] {
  const raw = readJson(ARENAS_KEY);
  if (raw === null) return [];
  const list = (raw as Partial<StoredArenas>)?.version === 1 ? (raw as StoredArenas).arenas : null;
  if (!Array.isArray(list)) {
    console.warn(`[vpg] Ignoring unreadable saved arenas in ${ARENAS_KEY}.`);
    return [];
  }
  const out: ArenaData[] = [];
  const ids = new Set<string>();
  const migrated = [...list];
  let changed = false;
  for (const [index, stored] of list.entries()) {
    try {
      const candidate = withCurrentTextures(stored);
      validateArena(candidate, "any");
      if (isBundledArena(candidate.id) || ids.has(candidate.id)) throw new Error(`id ${candidate.id} is already taken`);
      ids.add(candidate.id);
      const normalized = withPieceIds(candidate);
      out.push(normalized);
      const piecesChanged =
        normalized.floor !== candidate.floor || normalized.barricade !== candidate.barricade || normalized.outer !== candidate.outer;
      if (candidate !== stored || piecesChanged) {
        migrated[index] = normalized;
        changed = true;
      }
    } catch (error) {
      console.warn(`[vpg] Skipping a saved arena: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (changed) {
    try {
      // Keep skipped records in storage so migration cannot erase player work.
      writeJsonOrThrow(ARENAS_KEY, { ...(raw as StoredArenas), arenas: migrated });
    } catch (error) {
      // The arenas remain usable; the original save is retried on the next load.
      console.warn(`[vpg] Could not store migrated arena references: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return out;
}

function persist(next: ArenaData[]): void {
  writeJsonOrThrow(ARENAS_KEY, { version: 1, arenas: next } satisfies StoredArenas);
  arenas = next;
  publishUserArenas(arenas);
}

/** Reads saved arenas into the menus, persisting old piece paths as ids and moved texture paths at startup. */
export function loadSavedArenas(): void {
  arenas = readStored();
  publishUserArenas(arenas);
}

export function savedArenas(): readonly ArenaData[] {
  return arenas;
}

/**
 * Validates and stores an arena, replacing one with the same id.
 *
 * Bundled ids are refused: the editor clones a bundled arena under a new id
 * rather than shadowing the original.
 */
export function saveArena(arena: ArenaData, images: ImageScope): { created: boolean } {
  validateArena(arena, images);
  if (isBundledArena(arena.id)) throw new Error(`"${arena.id}" is a bundled arena. Clone it under a new id.`);
  const index = arenas.findIndex((candidate) => candidate.id === arena.id);
  if (index < 0 && arenas.length >= MAX_USER_ARENAS) throw new Error(`At most ${MAX_USER_ARENAS} arenas can be saved.`);
  const next = [...arenas];
  const normalized = structuredClone(withPieceIds(arena));
  if (index < 0) next.push(normalized);
  else next[index] = normalized;
  persist(next);
  return { created: index < 0 };
}

export function deleteArena(id: string): void {
  if (!arenas.some((arena) => arena.id === id)) throw new Error(`No saved arena "${id}".`);
  persist(arenas.filter((arena) => arena.id !== id));
}

export function readDraft(): ArenaRecovery | null {
  const raw = readJson(DRAFT_KEY) as { editingId?: unknown; draft?: unknown } | null;
  const draft = parseDraft(raw?.draft);
  if (!draft) return null;
  const editingId = typeof raw?.editingId === "string" ? raw.editingId : null;
  // A draft for an arena that has since been deleted resumes as a new arena.
  const stillSaved = editingId !== null && !isBundledArena(editingId) && arenaById(editingId) !== null;
  if (stillSaved) draft.id = editingId;
  return { editingId: stillSaved ? editingId : null, draft };
}

/** Best effort: a lost recovery copy must not interrupt editing. Returns false when it was not stored. */
export function writeDraft(recovery: ArenaRecovery): boolean {
  try {
    writeJsonOrThrow(DRAFT_KEY, recovery);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  removeSavedValue(DRAFT_KEY);
}

/** Imported images that saved arenas or the parked draft still use. */
export function imagesInUse(): Set<string> {
  const ids = new Set<string>();
  for (const arena of arenas) for (const id of referencedImages(arena)) ids.add(id);
  const draft = readDraft();
  if (draft) for (const id of referencedImages(draft.draft)) ids.add(id);
  return ids;
}
