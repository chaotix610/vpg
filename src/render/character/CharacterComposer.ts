import {
  composeSlots,
  decodeIndexedPng,
  filesForPlan,
  paletteBytes,
  pictureOf,
  tileRgba,
  type CharacterManifest,
  type ComposedTile,
  type CostumePlan,
  type PicturePayload,
} from "@/content/characterLook";
import { creatorAssetUrl } from "@/content/characterCatalog";

/**
 * Browser-side slot tile composer for modular characters.
 *
 * Fetches and caches palettes.json and indexed PNG textures from
 * `public/assets/characters/creator/`, then delegates all pixel/palette
 * composition to the pure functions in `src/content/characterLook.ts`.
 */

export interface ComposedSlotResult {
  tiles: Record<number, ComposedTile & { rgba: Uint8ClampedArray }>;
  problems: string[];
}

export class CharacterComposer {
  private readonly pictures = new Map<number, Promise<PicturePayload>>();
  private palettesPromise: Promise<Map<number, Uint8Array>> | null = null;

  constructor(private readonly manifest: CharacterManifest) {}

  private loadPalettes(): Promise<Map<number, Uint8Array>> {
    this.palettesPromise ??= (async () => {
      const response = await fetch(creatorAssetUrl(this.manifest.palettes));
      if (!response.ok) throw new Error(`${this.manifest.palettes} could not be loaded (${response.status})`);
      const json = (await response.json()) as { palettes: Record<string, string> };
      return new Map(Object.entries(json.palettes).map(([id, hex]) => [Number(id), paletteBytes(hex)]));
    })().catch((err) => {
      this.palettesPromise = null;
      throw err;
    });
    return this.palettesPromise;
  }

  private loadPicture(id: number): Promise<PicturePayload> {
    let pending = this.pictures.get(id);
    if (!pending) {
      const entry = this.manifest.pictures[String(id)];
      pending = (async () => {
        if (!entry) throw new Error(`picture ${id} is not in the manifest`);
        const response = await fetch(creatorAssetUrl(entry.src));
        if (!response.ok) throw new Error(`${entry.src} could not be loaded (${response.status})`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        return pictureOf(entry, await decodeIndexedPng(bytes));
      })().catch((err) => {
        this.pictures.delete(id);
        throw err;
      });
      this.pictures.set(id, pending);
    }
    return pending;
  }

  /** Composes every active slot tile of a costume plan into RGBA pixel buffers. */
  async compose(plan: CostumePlan): Promise<ComposedSlotResult> {
    const needed = filesForPlan(this.manifest, plan);
    const problems: string[] = [];
    const palettes = await this.loadPalettes();
    const loaded = new Map<number, PicturePayload>();

    await Promise.all(
      needed.pictures.map(async (id) => {
        try {
          loaded.set(id, await this.loadPicture(id));
        } catch (error) {
          problems.push(error instanceof Error ? error.message : String(error));
        }
      }),
    );

    const empty: PicturePayload = { width: 0, height: 0, eightBit: true, payload: new Uint8Array(0) };
    const tiles = composeSlots(this.manifest, plan, {
      picture: (id) => loaded.get(id) ?? empty,
      palette: (id) => {
        const found = palettes.get(id);
        if (found) return found;
        problems.push(`palette ${id} is not in ${this.manifest.palettes}`);
        return new Uint8Array(0);
      },
    });

    const out: Record<number, ComposedTile & { rgba: Uint8ClampedArray }> = {};
    for (const [slotKey, tile] of Object.entries(tiles)) {
      out[Number(slotKey)] = { ...tile, rgba: tileRgba(tile) };
    }
    return { tiles: out, problems: [...new Set(problems)] };
  }
}
