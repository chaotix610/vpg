/** Encode each filename while preserving path separators. */
export const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

/**
 * Asset folders that have moved. Player saves keep the paths they were written
 * with, so add a row here whenever a folder they can reference moves.
 */
const MOVED_FOLDERS: readonly (readonly [from: string, to: string])[] = [
  ["assets/environments/arenas/shared/ring/", "assets/environments/ring/"],
];

/** The current path for an asset that may have been saved under a folder that has since moved. */
export function currentAssetPath(assetPath: string): string {
  for (const [from, to] of MOVED_FOLDERS) {
    if (assetPath.startsWith(from)) return to + assetPath.slice(from.length);
  }
  return assetPath;
}

/** Public assets retain their authored filenames and work below a deployment subpath. */
export function publicAssetUrl(assetPath: string, base = import.meta.env.BASE_URL): string {
  return `${base.endsWith("/") ? base : `${base}/`}${encodePath(assetPath)}`;
}
