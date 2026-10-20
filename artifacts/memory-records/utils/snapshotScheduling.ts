export const SNAPSHOT_IDLE_DELAY_MS = 2 * 60 * 1000;

export function isSnapshotHomeRoute(segments: readonly string[]): boolean {
  return segments.length === 1 && segments[0] === "(tabs)";
}

export function snapshotIdleDelay(
  state: {
    eligible: boolean;
    foreground: boolean;
    ready: boolean;
    blocked: boolean;
    automaticEnabled: boolean;
    running: boolean;
    lastActivityAt: number;
  },
  now = Date.now(),
): number | null {
  if (!state.eligible || !state.foreground || !state.ready || state.blocked ||
      !state.automaticEnabled || state.running) return null;
  return Math.max(0, SNAPSHOT_IDLE_DELAY_MS - Math.max(0, now - state.lastActivityAt));
}
