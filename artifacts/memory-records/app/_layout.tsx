import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  DeviceEventEmitter,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { AppSplash } from "@/components/AppSplash";
import { AppLockScreen } from "@/components/AppLock";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLockProvider, useAppLock } from "@/context/AppLockContext";
import { AuthProvider } from "@/context/AuthContext";
import { RecordsProvider } from "@/context/RecordsContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { UnlockProvider } from "@/context/UnlockContext";
import { useColors } from "@/hooks/useColors";
import { useRecords } from "@/context/RecordsContext";
import { useSettings } from "@/context/SettingsContext";
import {
  maybeCreateAutomaticSnapshot,
  type SnapshotProgress,
} from "@/utils/localSnapshots";
import {
  getCompleteBackupReminderStatus,
  snoozeCompleteBackupReminder,
} from "@/utils/completeBackupReminder";
import { isSnapshotHomeRoute, snapshotIdleDelay } from "@/utils/snapshotScheduling";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const SNAPSHOT_WAKE_LOCK = "memory-records-local-snapshot";
const SNAPSHOT_ACTIVITY_EVENT = "localSnapshotUserActivity";

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="new-record" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="record/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ presentation: "modal", headerShown: false }} />
    </Stack>
  );
}

function AppRuntime({
  splashDone,
  onSplashDone,
}: {
  splashDone: boolean;
  onSplashDone: () => void;
}) {
  const { isReady: lockReady, isEnabled, isLocked } = useAppLock();
  const unlocked = lockReady && (!isEnabled || !isLocked);

  return (
    <>
      {lockReady ? <RootLayoutNav /> : null}
      {lockReady ? (
        <LocalSnapshotManager enabled={splashDone && unlocked} />
      ) : null}
      {lockReady ? (
        <CompleteBackupReminderManager enabled={splashDone && unlocked} />
      ) : null}
      {lockReady ? <AppLockScreen active={splashDone} /> : null}
      {!splashDone || !lockReady ? (
        <AppSplash onDone={onSplashDone} />
      ) : null}
    </>
  );
}

function CompleteBackupReminderManager({ enabled }: { enabled: boolean }) {
  const { records, isLoading } = useRecords();
  const { isLoading: settingsLoading } = useSettings();
  const checkedThisLaunch = React.useRef(false);

  useEffect(() => {
    if (
      !enabled ||
      Platform.OS !== "android" ||
      isLoading ||
      settingsLoading ||
      checkedThisLaunch.current
    ) return;

    checkedThisLaunch.current = true;
    void getCompleteBackupReminderStatus(records.length)
      .then((status) => {
        if (!status.due) return;
        const message =
          status.reason === "never-backed-up"
            ? "Your memories and attached media have not yet been saved in a portable complete backup."
            : status.reason === "restore"
              ? "Your library was restored or recovered. Create a fresh complete backup of its current state."
              : status.reason === "changes"
                ? `${status.changedRecordCount} memories have been created or edited since your last complete backup.`
                : "Your last complete backup is more than 30 days old.";
        Alert.alert("Complete backup recommended", message, [
          {
            text: "Remind Me Later",
            onPress: () => {
              snoozeCompleteBackupReminder().catch(() => {});
            },
          },
          {
            text: "View Backup",
            onPress: () => router.push("/settings"),
          },
        ]);
      })
      .catch((error) =>
        console.warn("[CompleteBackupReminder] launch check failed:", error));
  }, [enabled, isLoading, records.length, settingsLoading]);

  return null;
}

/** Foreground-only opportunistic snapshot trigger. Failures are intentionally
 * contained: a snapshot must never prevent the normal app from opening. */
function LocalSnapshotManager({ enabled }: { enabled: boolean }) {
  const { records, knownTags, isLoading } = useRecords();
  const { settings, isLoading: settingsLoading } = useSettings();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isMemoriesScreen = isSnapshotHomeRoute(segments);
  const running = React.useRef(false);
  const ready = React.useRef(false);
  const foregroundRef = React.useRef(AppState.currentState === "active");
  const eligibleRef = React.useRef(false);
  const blockedRef = React.useRef(false);
  const keyboardVisibleRef = React.useRef(Keyboard.isVisible());
  const touchActiveRef = React.useRef(false);
  const lastActivityAt = React.useRef(Date.now());
  const activityVersion = React.useRef(0);
  const scheduleRef = React.useRef<() => void>(() => {});
  const lastChecked = React.useRef<{
    records: typeof records;
    tags: typeof knownTags;
    settings: typeof settings;
    day: string;
  } | null>(null);
  const recordsRef = React.useRef(records);
  const tagsRef = React.useRef(knownTags);
  const settingsRef = React.useRef(settings);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState<SnapshotProgress | null>(null);
  recordsRef.current = records;
  tagsRef.current = knownTags;
  settingsRef.current = settings;
  eligibleRef.current = enabled && isMemoriesScreen;

  const run = useCallback(() => {
    const latestSettings = settingsRef.current;
    if (
      Platform.OS === "web" ||
      !foregroundRef.current ||
      !eligibleRef.current ||
      blockedRef.current ||
      keyboardVisibleRef.current ||
      touchActiveRef.current ||
      !ready.current ||
      !latestSettings.automaticSnapshotsEnabled ||
      running.current
    ) return;
    const inputs = {
      records: recordsRef.current,
      tags: tagsRef.current,
      settings: settingsRef.current,
      day: new Date().toDateString(),
    };
    const previous = lastChecked.current;
    if (previous && previous.records === inputs.records && previous.tags === inputs.tags &&
        previous.settings === inputs.settings && previous.day === inputs.day) return;
    console.info("[LocalSnapshots] Foreground snapshot check started.");
    running.current = true;
    DeviceEventEmitter.emit("localSnapshotOperationStatus", true);
    const activityAtStart = activityVersion.current;
    void (async () => {
      let wakeLockActive = false;
      let wakeLockStart: Promise<void> | null = null;
      try {
        const status = await maybeCreateAutomaticSnapshot(
          recordsRef.current,
          tagsRef.current,
          latestSettings,
          (nextProgress) => {
            // Unchanged-data checks are silent. Only actual snapshot work
            // gets a status banner and an active-operation wake lock.
            if (nextProgress.stage === "Checking for changes") return;
            setProgress(nextProgress);
            if (!wakeLockStart) {
              wakeLockStart = activateKeepAwakeAsync(SNAPSHOT_WAKE_LOCK)
                .then(() => { wakeLockActive = true; })
                .catch((error) => console.warn("[LocalSnapshots] wake lock unavailable:", error));
            }
          },
        );
        if (!status.lastError) lastChecked.current = inputs;
      } catch (error) {
        console.warn("[LocalSnapshots] foreground check failed:", error);
      } finally {
        if (wakeLockStart) await wakeLockStart;
        if (wakeLockActive) {
          await deactivateKeepAwake(SNAPSHOT_WAKE_LOCK).catch((error) =>
            console.warn("[LocalSnapshots] wake lock release failed:", error));
        }
      }
    })()
      .finally(() => {
        running.current = false;
        DeviceEventEmitter.emit("localSnapshotOperationStatus", false);
        setProgress(null);
        DeviceEventEmitter.emit("localSnapshotChanged");
        if (activityVersion.current !== activityAtStart) scheduleRef.current();
      });
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const remaining = snapshotIdleDelay({
      eligible: eligibleRef.current && Platform.OS !== "web",
      blocked: blockedRef.current || keyboardVisibleRef.current || touchActiveRef.current,
      foreground: foregroundRef.current,
      ready: ready.current,
      automaticEnabled: settingsRef.current.automaticSnapshotsEnabled,
      running: running.current,
      lastActivityAt: lastActivityAt.current,
    });
    if (remaining === null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (foregroundRef.current) run();
    }, remaining);
  }, [run]);
  scheduleRef.current = schedule;

  useEffect(() => {
    ready.current = enabled && !isLoading && !settingsLoading;
    lastActivityAt.current = Date.now();
    schedule();
  }, [enabled, isLoading, isMemoriesScreen, schedule, settingsLoading]);

  useEffect(() => {
    lastActivityAt.current = Date.now();
    activityVersion.current += 1;
    schedule();
  }, [knownTags, records, schedule, settings]);

  useEffect(() => {
    const activitySubscription = DeviceEventEmitter.addListener(SNAPSHOT_ACTIVITY_EVENT, (touchActive: boolean) => {
      touchActiveRef.current = touchActive;
      lastActivityAt.current = Date.now();
      activityVersion.current += 1;
      schedule();
    });
    const keyboardShown = Keyboard.addListener("keyboardDidShow", () => {
      keyboardVisibleRef.current = true;
      schedule();
    });
    const keyboardHidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisibleRef.current = false;
      lastActivityAt.current = Date.now();
      schedule();
    });
    const blockerSubscription = DeviceEventEmitter.addListener("localSnapshotAutomaticBlocked", (blocked: boolean) => {
      blockedRef.current = blocked;
      lastActivityAt.current = Date.now();
      schedule();
    });
    const changedSubscription = DeviceEventEmitter.addListener(
      "localSnapshotChanged",
      (change?: { invalidateAutomaticCheck?: boolean }) => {
        if (!change?.invalidateAutomaticCheck) return;
        lastChecked.current = null;
        lastActivityAt.current = Date.now();
        schedule();
      },
    );
    const subscription = AppState.addEventListener("change", (state) => {
      foregroundRef.current = state === "active";
      keyboardVisibleRef.current = state === "active" && Keyboard.isVisible();
      if (state !== "active") touchActiveRef.current = false;
      if (state === "active") {
        lastActivityAt.current = Date.now();
        schedule();
      }
      if (state !== "active" && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    });
    return () => {
      subscription.remove();
      activitySubscription.remove();
      blockerSubscription.remove();
      changedSubscription.remove();
      keyboardShown.remove();
      keyboardHidden.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [schedule]);

  if (!progress || !enabled || !isMemoriesScreen) return null;
  const ratio = progress.total > 0 ? progress.current / progress.total : 0;
  return (
    <View style={[snapshotStyles.overlay, { top: insets.top + 8 }]} pointerEvents="none">
      <View
        style={[snapshotStyles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        accessibilityRole="progressbar"
        accessibilityLabel={`Local snapshot: ${progress.stage}`}
      >
        <ActivityIndicator size="small" color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[snapshotStyles.title, { color: colors.foreground }]}>Protecting your memories</Text>
          <Text style={[snapshotStyles.stage, { color: colors.mutedForeground }]}>{progress.stage}</Text>
          <View style={[snapshotStyles.track, { backgroundColor: colors.border }]}>
            <View style={[snapshotStyles.fill, { backgroundColor: colors.primary, width: `${Math.min(100, Math.max(3, ratio * 100))}%` }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const snapshotStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 430,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    elevation: 3,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  stage: { marginTop: 3, fontFamily: "Inter_400Regular", fontSize: 12 },
  track: { height: 3, width: "100%", marginTop: 7, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Hide the native splash immediately so our custom one takes over
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView
            style={{ flex: 1 }}
            onTouchStart={() => DeviceEventEmitter.emit(SNAPSHOT_ACTIVITY_EVENT, true)}
            onTouchMove={() => DeviceEventEmitter.emit(SNAPSHOT_ACTIVITY_EVENT, true)}
            onTouchEnd={(event) => DeviceEventEmitter.emit(SNAPSHOT_ACTIVITY_EVENT, (event.nativeEvent.touches?.length ?? 0) > 0)}
            onTouchCancel={() => DeviceEventEmitter.emit(SNAPSHOT_ACTIVITY_EVENT, false)}
          >
            <KeyboardProvider>
              <AuthProvider>
                <UnlockProvider>
                  <SettingsProvider>
                    <RecordsProvider>
                      <AppLockProvider>
                        <AppRuntime
                          splashDone={splashDone}
                          onSplashDone={handleSplashDone}
                        />
                      </AppLockProvider>
                    </RecordsProvider>
                  </SettingsProvider>
                </UnlockProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
