import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { API_SERVER_URL } from "@/constants/api";
import { deleteSecureItem, getSecureItem, setSecureItem } from "@/utils/secureStorage";

/** SecureStore key. Value is the Unix-ms timestamp when the unlock was last confirmed. */
const UNLOCK_STORE_KEY = "mr_ai_unlocked";
/** Re-verify against the server at most once every 12 h. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const body = await response.text();
  if (!body.trim()) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

interface UnlockContextType {
  /** Whether the premium feature pack (AI features and voice memos) is unlocked. */
  isPremiumUnlocked: boolean;
  /** True while a network status check is in progress. */
  isChecking: boolean;
  /** Manually re-check unlock status against the server. */
  checkStatus: () => Promise<void>;
  /** Match a completed PayPal contribution using the payer email. */
  checkPayment: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Activate with a one-time code distributed by the developer. */
  activateCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
}

const UnlockContext = createContext<UnlockContextType | null>(null);

export function UnlockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false);
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
        `${API_SERVER_URL}/api/unlock/status/${encodeURIComponent(deviceToken)}?_=${Date.now()}`,
        { signal: controller.signal, cache: "no-store" },
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as { unlocked: boolean };
        setIsPremiumUnlocked(data.unlocked);
        if (data.unlocked) {
          await setSecureItem(UNLOCK_STORE_KEY, String(Date.now()));
        } else {
          await deleteSecureItem(UNLOCK_STORE_KEY);
        }
      }
    } catch {
      // Network unavailable — keep cached state; do not downgrade to locked
    } finally {
      setIsChecking(false);
    }
  }, [deviceToken]);

  const checkPayment = useCallback(
    async (email: string): Promise<{ ok: boolean; error?: string }> => {
      if (!deviceToken) return { ok: false, error: "Device not ready" };
      setIsChecking(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${API_SERVER_URL}/api/unlock/payment-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), deviceToken }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await readJsonResponse<{ unlocked?: boolean; error?: string }>(res);
        if (res.ok && data?.unlocked) {
          setIsPremiumUnlocked(true);
          await setSecureItem(UNLOCK_STORE_KEY, String(Date.now()));
          return { ok: true };
        }

        // Compatibility with the currently published API, which predates the
        // email-matching endpoint. Earlier PayPal payments may already have
        // unlocked this device through the original IPN flow.
        if (res.status === 404 && !data) {
          const statusRes = await fetch(
            `${API_SERVER_URL}/api/unlock/status/${encodeURIComponent(deviceToken)}?_=${Date.now()}`,
            { cache: "no-store" },
          );
          const statusData = await readJsonResponse<{ unlocked?: boolean }>(statusRes);
          if (statusRes.ok && statusData?.unlocked) {
            setIsPremiumUnlocked(true);
            await setSecureItem(UNLOCK_STORE_KEY, String(Date.now()));
            return { ok: true };
          }
          return {
            ok: false,
            error: "Email payment checks are not available until the server update is published",
          };
        }

        return { ok: false, error: data?.error ?? "Payment not found" };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Network error",
        };
      } finally {
        setIsChecking(false);
      }
    },
    [deviceToken],
  );

  // ── On mount: use cache first, refresh in background ─────────────────────
  useEffect(() => {
    if (!deviceToken) return;
    (async () => {
      const cached = await getSecureItem(UNLOCK_STORE_KEY);
      if (cached) {
        const ts = parseInt(cached, 10);
        if (!isNaN(ts) && Date.now() - ts < CACHE_TTL_MS) {
          setIsPremiumUnlocked(true);
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
          setIsPremiumUnlocked(true);
          await setSecureItem(UNLOCK_STORE_KEY, String(Date.now()));
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
      value={{ isPremiumUnlocked, isChecking, checkStatus, checkPayment, activateCode }}
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
