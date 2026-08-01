/**
 * Base URL of the Memory Records API server.
 * Override via EXPO_PUBLIC_API_SERVER_URL environment variable.
 */
export const API_SERVER_URL =
  process.env["EXPO_PUBLIC_API_SERVER_URL"] ??
  "https://memory-vault-manager.replit.app";
