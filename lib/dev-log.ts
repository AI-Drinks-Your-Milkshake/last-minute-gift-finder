/**
 * Tiny in-memory log store for the dev panel.
 * Module-level so writes work before DevPanel mounts.
 * Delete this file (and callers) before going live.
 */
export const DEV_LINES: string[] = [];
export const DEV_LISTENERS = new Set<() => void>();

export function devAppend(msg: string): void {
  DEV_LINES.push(msg);
  DEV_LISTENERS.forEach((fn) => fn());
}

export function devClear(): void {
  DEV_LINES.length = 0;
  DEV_LISTENERS.forEach((fn) => fn());
}
