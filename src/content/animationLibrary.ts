import { ANIM_DIR, CHAR_DIR, animations, characters } from "virtual:asset-manifest";
import { encodePath } from "./assetPaths";

export { ANIM_DIR, CHAR_DIR, encodePath };

export interface AssetListing {
  /** URL prefix prepended to every asset path ("" = same origin as the page). */
  assetBase: string;
  characters: string[];
  animations: string[];
}

export const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
export const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.glb$/i, "");
export const dirName = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/**
 * Lists are generated from public/assets. GLBs load on demand from the deployment
 * base, or from an explicitly configured asset host with the same assets/ layout.
 */
export async function resolveAssets(): Promise<AssetListing> {
  if (!characters.length || !animations.length) {
    throw new Error(`no .glb files found under ${CHAR_DIR} and ${ANIM_DIR} when the page was built`);
  }
  const base = import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL;
  const assetBase = base.endsWith("/") ? base : `${base}/`;
  return {
    assetBase,
    characters: [...characters].sort(naturalSort),
    animations: [...animations].sort(naturalSort),
  };
}
