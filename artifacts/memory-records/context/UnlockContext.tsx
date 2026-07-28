import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "./AuthContext";
import { API_SERVER_URL } from "@/constants/api";

/** SecureStore key. Value is the Unix-ms timestamp when the unlock was last confirmed. */
const UNLOCK_STORE_KEY = "mr_ai_unlocked";
/** Re-verify against the server at most once every 12 h. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface UnlockContextType {
  /** Whether the AI features are unlocked for this device. */
  isAiUnlocked: boolean;
  /** True while a network status check is in progress. */
  isChecking: boolean;
  /** Manually re-check unlock status against the server. */
  checkStatus: () => Promise<void>;
  /** Activate with a one-time code distributed by the developer. */
  activateCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

const UnlockContext = createContext<UnlockContextType | null>(null);

export function UnlockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isAiUnlocked, setIsAiUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const deviceToken = user?.token ?? null;

  // ── Network status check ──────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    if (!deviceToken) return;
    setIsChecking(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `${API_SERVER_URL}/api/unlock/status/${encodeURIComponent(deviceToken)}`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as { unlocked: boolean };
        setIsAiUnlocked(data.unlocked);
        if (data.unlocked) {
          await SecureStore.setItemAsync(UNLOCK_STORE_KEY, String(Date.now()));
        } else {
          await SecureStore.deleteItemAsync(UNLOCK_STORE_KEY);
        }
      }
    } catch {
      // Network unavailable — keep cached state; do not downgrade to locked
    } finally {
      setIsChecking(false);
    }
  }, [deviceToken]);

  // ── On mount: use cache first, refresh in background ─────────────────────
  useEffect(() => {
    if (!deviceToken) return;
    (async () => {
      const cached = await SecureStore.getItemAsync(UNLOCK_STORE_KEY);
      if (cached) {
        const ts = parseInt(cached, 10);
        if (!isNaN(ts) && Date.now() - ts < CACHE_TTL_MS) {
          setIsAiUnlocked(true);
          return; // Cache still fresh — skip network until next open
        }
      }
      // Cache absent or stale — check server
      await checkStatus();
    })();
  }, [deviceToken, checkStatus]);

  // ── Manual code activation ────────────────────────────────────────────────
  const activateCode = useCallback(
    async (code: string): Promise<{ ok: boolean; error?: string }> => {
      if (!deviceToken) return { ok: false, error: "Device not ready" };
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${API_SERVER_URL}/api/unlock/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            deviceToken,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = (await res.json()) as { unlocked?: boolean; error?: string };
        if (res.ok && data.unlocked) {
          setIsAiUnlocked(true);
          await SecureStore.setItemAsync(UNLOCK_STORE_KEY, String(Date.now()));
          return { ok: true };
        }
        return { ok: false, error: data.error ?? "Activation failed" };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Network error",
        };
      }
    },
    [deviceToken],
  );

  return (
    <UnlockContext.Provider
      value={{ isAiUnlocked, isChecking, checkStatus, activateCode }}
    >
      {children}
    </UnlockContext.Provider>
  );
}

export function useUnlock() {
  const ctx = useContext(UnlockContext);
  if (!ctx) throw new Error("useUnlock must be used within UnlockProvider");
  return ctx;
}
