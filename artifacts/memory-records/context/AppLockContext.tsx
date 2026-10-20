import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from "@/utils/secureStorage";

const APP_LOCK_ENABLED_KEY = "mr_app_lock_enabled";
const APP_LOCK_PIN_KEY = "mr_app_lock_pin";
const BACKGROUND_LOCK_TIMEOUT_MS = 30_000;

export const APP_LOCK_PIN_LENGTH = 4;

export function isValidAppPin(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

interface AppLockContextValue {
  isReady: boolean;
  isSupported: boolean;
  isEnabled: boolean;
  isLocked: boolean;
  hasPin: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  savePin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  unlock: () => void;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const isSupported = Platform.OS !== "web";
  const [isReady, setIsReady] = useState(!isSupported);
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const enabledRef = useRef(false);
  const previousAppState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isSupported) return;
    let mounted = true;

    void (async () => {
      try {
        const [enabledValue, storedPin] = await Promise.all([
          getSecureItem(APP_LOCK_ENABLED_KEY),
          getSecureItem(APP_LOCK_PIN_KEY),
        ]);
        if (!mounted) return;

        const validPin = isValidAppPin(storedPin);
        const enabled = enabledValue === "true" && validPin;
        setHasPin(validPin);
        enabledRef.current = enabled;
        setIsEnabledState(enabled);
        setIsLocked(enabled);

        // A missing/corrupt PIN must never trap the user behind an unusable lock.
        if (enabledValue === "true" && !validPin) {
          await deleteSecureItem(APP_LOCK_ENABLED_KEY);
        }
      } catch (error) {
        console.warn("[AppLock] Could not load the local lock state:", error);
        enabledRef.current = false;
        setIsEnabledState(false);
        setIsLocked(false);
      } finally {
        if (mounted) setIsReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = previousAppState.current;

      if (nextState === "background" && previousState !== "background") {
        backgroundedAt.current = Date.now();
      } else if (nextState === "active" && previousState === "background") {
        const backgroundStart = backgroundedAt.current;
        backgroundedAt.current = null;
        if (
          enabledRef.current &&
          backgroundStart !== null &&
          Date.now() - backgroundStart > BACKGROUND_LOCK_TIMEOUT_MS
        ) {
          setIsLocked(true);
        }
      }

      previousAppState.current = nextState;
    });

    return () => subscription.remove();
  }, [isSupported]);

  const savePin = useCallback(async (pin: string) => {
    if (!isValidAppPin(pin)) {
      throw new Error("The PIN must contain exactly 4 digits.");
    }
    await setSecureItem(APP_LOCK_PIN_KEY, pin);
    setHasPin(true);
  }, []);

  const verifyPin = useCallback(async (pin: string) => {
    if (!isValidAppPin(pin)) return false;
    const storedPin = await getSecureItem(APP_LOCK_PIN_KEY);
    return isValidAppPin(storedPin) && storedPin === pin;
  }, []);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!isSupported) return;

      if (enabled) {
        const storedPin = await getSecureItem(APP_LOCK_PIN_KEY);
        if (!isValidAppPin(storedPin)) {
          throw new Error("Set a 4-digit PIN before enabling the app lock.");
        }
        await setSecureItem(APP_LOCK_ENABLED_KEY, "true");
        enabledRef.current = true;
        setHasPin(true);
        setIsEnabledState(true);
        setIsLocked(true);
        return;
      }

      await deleteSecureItem(APP_LOCK_ENABLED_KEY);
      enabledRef.current = false;
      setIsEnabledState(false);
      setIsLocked(false);
    },
    [isSupported],
  );

  const unlock = useCallback(() => setIsLocked(false), []);

  const value = useMemo(
    () => ({
      isReady,
      isSupported,
      isEnabled,
      isLocked,
      hasPin,
      setEnabled,
      savePin,
      verifyPin,
      unlock,
    }),
    [
      hasPin,
      isEnabled,
      isLocked,
      isReady,
      isSupported,
      savePin,
      setEnabled,
      unlock,
      verifyPin,
    ],
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error("useAppLock must be used within AppLockProvider");
  }
  return context;
}
