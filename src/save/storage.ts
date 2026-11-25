/** Small browser repository shared by the current control and audio preferences. */
export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // Storage may be absent in Node, blocked in a browser, or contain malformed JSON.
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked or full store must not prevent the player from using the menus.
  }
}

/**
 * Like `writeJson`, but throws when the value was not stored. For player work,
 * such as a saved arena, where silently losing the write would lose the work.
 */
export function writeJsonOrThrow(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    const quota = error instanceof DOMException && error.name === "QuotaExceededError";
    throw new Error(quota ? "Browser storage is full." : "Browser storage is unavailable.", { cause: error });
  }
}

export function removeSavedValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Preferences still reset in memory when storage is unavailable.
  }
}
