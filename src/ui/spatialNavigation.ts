export type NavigationDirection = "up" | "down" | "left" | "right";

export interface NavigationTarget {
  id: string;
  x: number;
  y: number;
}

/** Find the closest option in a direction, preferring options aligned with it. */
export function nextNavigationTarget(
  targets: readonly NavigationTarget[],
  currentId: string,
  direction: NavigationDirection,
): string | null {
  const current = targets.find((target) => target.id === currentId);
  if (!current) return null;

  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  let next: string | null = null;
  let bestScore = Infinity;

  for (const target of targets) {
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const forward = sign * (horizontal ? dx : dy);
    if (forward <= 1) continue;

    const sideways = Math.abs(horizontal ? dy : dx);
    const score = Math.hypot(forward, sideways) + sideways * 2;
    if (score < bestScore) {
      bestScore = score;
      next = target.id;
    }
  }

  return next;
}
