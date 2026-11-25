/**
 * Kept apart from the rest of the viewer so the menu can check for a viewer
 * bookmark without importing (and bundling) Babylon.
 */

/** Whether the URL hash names a character or clip, i.e. the page was opened from a viewer bookmark. */
export function hasViewerHash(): boolean {
  const p = new URLSearchParams(location.hash.slice(1));
  return p.has("character") || p.has("animation");
}
