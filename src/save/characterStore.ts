import { shallowRef } from "vue";
import type { WrestlerCostume, WrestlerDocument, WrestlerProfile, WrestlerSummary } from "@/content/characterLook";
import { readJson, removeSavedValue, writeJsonOrThrow } from "./storage";

/**
 * Browser persistence for created and edited wrestlers, kept in localStorage
 * under `vpg-characters` (paralleling `src/save/arenaStore.ts`).
 *
 * Bundled roster wrestlers keep only their edited `profile` and `look` deltas
 * so storage stays compact; newly created wrestlers are stored in full.
 */

export const CHARACTERS_KEY = "vpg-characters";
export const MAX_CREATED_CHARACTERS = 100;
const MAX_CHANGES = 300;

export interface CharacterChange {
  at: number;
  id: string;
  note: string;
}

export interface BundledWrestlerEdit {
  profile: WrestlerProfile;
  look: { costumes: WrestlerCostume[] };
}

interface StoredCharacters {
  version: 1;
  edited: Record<string, BundledWrestlerEdit>;
  created: WrestlerDocument[];
  changes: CharacterChange[];
}

const emptyStore = (): StoredCharacters => ({
  version: 1,
  edited: {},
  created: [],
  changes: [],
});

let state: StoredCharacters = emptyStore();

/** Reactive snapshot of saved custom/edited entries so editors and viewers stay in sync. */
export const savedCharactersRevision = shallowRef(0);

/** Deep-clones plain JSON structures safely even when passed a Vue reactive Proxy. */
function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates the minimal structural contract of a wrestler document (for storage and JSON paste/import). */
export function isValidWrestlerDocument(value: unknown): value is WrestlerDocument {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (!isRecord(value.profile) || typeof value.profile.fullName !== "string") return false;
  if (!isRecord(value.look) || !Array.isArray(value.look.costumes) || value.look.costumes.length === 0) return false;
  return value.look.costumes.every((c) => isRecord(c) && isRecord(c.fields));
}

function isValidEdit(value: unknown): value is BundledWrestlerEdit {
  if (!isRecord(value)) return false;
  if (!isRecord(value.profile) || typeof value.profile.fullName !== "string") return false;
  if (!isRecord(value.look) || !Array.isArray(value.look.costumes) || value.look.costumes.length === 0) return false;
  return value.look.costumes.every((c) => isRecord(c) && isRecord(c.fields));
}

function readStored(): StoredCharacters {
  const raw = readJson(CHARACTERS_KEY);
  if (raw === null) return emptyStore();
  if (!isRecord(raw) || raw.version !== 1) {
    console.warn(`[vpg] Ignoring unreadable saved characters in ${CHARACTERS_KEY}.`);
    return emptyStore();
  }

  const edited: Record<string, BundledWrestlerEdit> = {};
  if (isRecord(raw.edited)) {
    for (const [id, entry] of Object.entries(raw.edited)) {
      if (isValidEdit(entry)) edited[id] = plainClone(entry);
    }
  }

  const created: WrestlerDocument[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(raw.created)) {
    for (const entry of raw.created) {
      if (isValidWrestlerDocument(entry) && !seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        created.push(plainClone(entry));
      }
    }
  }

  const changes: CharacterChange[] = [];
  if (Array.isArray(raw.changes)) {
    for (const item of raw.changes) {
      if (
        isRecord(item) &&
        typeof item.at === "number" &&
        typeof item.id === "string" &&
        typeof item.note === "string"
      ) {
        changes.push({ at: item.at, id: item.id, note: item.note });
      }
    }
  }

  return { version: 1, edited, created, changes: changes.slice(-MAX_CHANGES) };
}

function persist(next: StoredCharacters): boolean {
  const trimmed: StoredCharacters = {
    version: 1,
    edited: next.edited,
    created: next.created,
    changes: next.changes.slice(-MAX_CHANGES),
  };
  try {
    writeJsonOrThrow(CHARACTERS_KEY, trimmed);
    state = trimmed;
    savedCharactersRevision.value += 1;
    return true;
  } catch (error) {
    console.warn(`[vpg] Could not save characters: ${error instanceof Error ? error.message : String(error)}`);
    state = trimmed;
    savedCharactersRevision.value += 1;
    return false;
  }
}

/** Hydrates saved created/edited characters at startup. */
export function loadSavedCharacters(): void {
  state = readStored();
  savedCharactersRevision.value += 1;
}

export function savedBundledEdit(id: string): BundledWrestlerEdit | null {
  const edit = state.edited[id];
  return edit ? plainClone(edit) : null;
}

export function hasBundledEdit(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(state.edited, id);
}

export function savedCreatedWrestlers(): readonly WrestlerDocument[] {
  return state.created;
}

export function savedCreatedById(id: string): WrestlerDocument | null {
  const doc = state.created.find((entry) => entry.id === id);
  return doc ? plainClone(doc) : null;
}

export function characterChanges(): readonly CharacterChange[] {
  return state.changes;
}

export function summaryFromDocument(
  doc: WrestlerDocument,
  flags: { custom?: boolean; edited?: boolean } = {},
): WrestlerSummary {
  const bodyTypes = [...new Set(doc.look.costumes.map((c) => Number(c.fields?.body_type?.value ?? 0)))];
  return {
    id: doc.id,
    rosterIndex: doc.rosterIndex ?? null,
    fullName: doc.profile.fullName || doc.id,
    shortName: doc.profile.shortName ?? "",
    ringName: doc.profile.ringName ?? null,
    heightRaw: Number(doc.profile.heightRaw ?? 13),
    weightRaw: Number(doc.profile.weightRaw ?? 140),
    costumeCount: doc.look.costumes.length,
    bodyTypes,
    custom: flags.custom,
    edited: flags.edited,
  };
}

/** Saves an edit to a bundled roster wrestler or updates an existing created wrestler. */
export function saveWrestler(doc: WrestlerDocument, isCreated: boolean, note: string): boolean {
  const clone = plainClone(doc);
  const changes = [...state.changes, { at: Date.now(), id: clone.id, note }];
  if (isCreated) {
    const index = state.created.findIndex((entry) => entry.id === clone.id);
    if (index < 0 && state.created.length >= MAX_CREATED_CHARACTERS) {
      throw new Error(`At most ${MAX_CREATED_CHARACTERS} custom wrestlers can be saved.`);
    }
    const created = [...state.created];
    if (index < 0) created.push(clone);
    else created[index] = clone;
    return persist({ ...state, created, changes });
  }
  const edited = {
    ...state.edited,
    [clone.id]: {
      profile: clone.profile,
      look: clone.look,
    },
  };
  return persist({ ...state, edited, changes });
}

/** Deletes a user-created wrestler. Bundled wrestlers cannot be deleted (use revertBundledWrestler). */
export function deleteCreatedWrestler(id: string, note?: string): boolean {
  const existing = state.created.find((entry) => entry.id === id);
  if (!existing) return false;
  const created = state.created.filter((entry) => entry.id !== id);
  const changes = [...state.changes, { at: Date.now(), id, note: note ?? `${existing.profile.fullName} deleted` }];
  return persist({ ...state, created, changes });
}

/** Reverts browser edits to a bundled roster wrestler back to its shipped JSON. */
export function revertBundledWrestler(id: string, note?: string): boolean {
  if (!hasBundledEdit(id)) return false;
  const edited = { ...state.edited };
  delete edited[id];
  const changes = [...state.changes, { at: Date.now(), id, note: note ?? `${id} reverted to bundled version` }];
  return persist({ ...state, edited, changes });
}

/** Discards every saved edit and created wrestler kept in this browser. */
export function discardAllCharacterChanges(): void {
  removeSavedValue(CHARACTERS_KEY);
  state = emptyStore();
  savedCharactersRevision.value += 1;
}

/** Returns all custom and edited wrestler ids currently stored (for Animation Viewer integration). */
export function savedCustomCharactersForViewer(): { id: string; name: string; custom: boolean }[] {
  const out: { id: string; name: string; custom: boolean }[] = [];
  for (const doc of state.created) {
    out.push({ id: doc.id, name: doc.profile.fullName || doc.id, custom: true });
  }
  for (const [id, edit] of Object.entries(state.edited)) {
    out.push({ id, name: edit.profile.fullName || id, custom: false });
  }
  return out;
}
