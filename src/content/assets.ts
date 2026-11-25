import { models, paths } from "virtual:public-assets";
import { publicAssetUrl } from "./assetPaths";

const knownPaths = new Set(paths);
const knownModels = new Set(models);

/** Non-GLB runtime resources indexed from public/assets at dev/build time. */
export function knownAssetPaths(): string[] {
  return [...knownPaths].sort();
}

/** Resolve an authored assets/... path against the app's deployment base. */
export function resolveAsset(assetPath: string): string | null {
  return knownPaths.has(assetPath) ? publicAssetUrl(assetPath) : null;
}

export function requireAsset(assetPath: string): string {
  const url = resolveAsset(assetPath);
  if (url === null) throw new Error(`Missing runtime asset: public/${assetPath}`);
  return url;
}

export function missingAssets(assetPaths: Iterable<string>): string[] {
  return [...assetPaths].filter((assetPath) => !knownPaths.has(assetPath) && !knownModels.has(assetPath));
}

/** Whether an authored GLB path names an indexed arena model. */
export function isKnownModel(assetPath: string): boolean {
  return knownModels.has(assetPath);
}

/**
 * Resolve an arena GLB. Like the animation viewer's models, these follow
 * `VITE_ASSET_BASE` when it is set, so a deployment can host the heavy files
 * elsewhere while UI images keep the app's own base.
 */
export function resolveModel(assetPath: string): string | null {
  if (!knownModels.has(assetPath)) return null;
  return publicAssetUrl(assetPath, import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL);
}
