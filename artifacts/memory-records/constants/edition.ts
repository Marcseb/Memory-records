/**
 * Release boundary for google-play-free. Never derive this from stored settings,
 * an activation code, a backup, or an environment variable.
 */
export const PRO_FEATURES_ENABLED = false;
export const EDITION = "google-play-free";

export function requireProEdition(): never {
  throw new Error("This feature is not available in the free edition.");
}
