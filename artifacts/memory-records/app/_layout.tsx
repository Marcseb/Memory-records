import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  DeviceEventEmitter,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppSplash } from "@/components/AppSplash";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { RecordsProvider } from "@/context/RecordsContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { UnlockProvider } from "@/context/UnlockContext";
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

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const SNAPSHOT_WAKE_LOCK = "memory-records-local-snapshot";

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
  const running = React.useRef(false);
  const ready = React.useRef(false);
  const foregroundRef = React.useRef(true);
  const recordsRef = React.useRef(records);
  const tagsRef = React.useRef(knownTags);
  const settingsRef = React.useRef(settings);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState<SnapshotProgress | null>(null);
  recordsRef.current = records;
  tagsRef.current = knownTags;
  settingsRef.current = settings;

  const run = useCallback(() => {
    const latestSettings = settingsRef.current;
    if (
      Platform.OS === "web" ||
      !foregroundRef.current ||
      !ready.current ||
      !latestSettings.automaticSnapshotsEnabled ||
      running.current
    ) return;
    console.info("[LocalSnapshots] Foreground snapshot check started.");
    running.current = true;
    setProgress({ stage: "Checking for changes", current: 0, total: recordsRef.current.length });
    void (async () => {
      let wakeLockActive = false;
      try {
        await activateKeepAwakeAsync(SNAPSHOT_WAKE_LOCK);
        wakeLockActive = true;
        await maybeCreateAutomaticSnapshot(
          recordsRef.current,
          tagsRef.current,
          latestSettings,
          setProgress,
        );
      } catch (error) {
        console.warn("[LocalSnapshots] foreground check failed:", error);
      } finally {
        if (wakeLockActive) {
          await deactivateKeepAwake(SNAPSHOT_WAKE_LOCK).catch((error) =>
            console.warn("[LocalSnapshots] wake lock release failed:", error));
        }
      }
    })()
      .finally(() => {
        running.current = false;
        setProgress(null);
        DeviceEventEmitter.emit("localSnapshotChanged");
      });
  }, []);

  const schedule = useCallback(() => {
    if (
      !enabled ||
      Platform.OS === "web" ||
      timerRef.current ||
      running.current
    ) return;
    console.info("[LocalSnapshots] Foreground snapshot check scheduled.");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (foregroundRef.current) run();
    }, 2500);
  }, [enabled, run]);

  useEffect(() => {
    if (enabled && !isLoading && !settingsLoading) {
      ready.current = true;
      schedule();
    }
  }, [enabled, isLoading, schedule, settingsLoading]);

  useEffect(() => {
    if (ready.current) schedule();
  }, [knownTags, records, schedule, settings]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      foregroundRef.current = state === "active";
      if (state === "active" && ready.current) schedule();
      if (state !== "active" && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    });
    return () => {
      subscription.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [schedule]);

  if (!progress) return null;
  const ratio = progress.total > 0 ? progress.current / progress.total : 0;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={snapshotStyles.overlay} pointerEvents="none">
        <View style={snapshotStyles.card}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={snapshotStyles.title}>Protecting your memories</Text>
          <Text style={snapshotStyles.stage}>{progress.stage}</Text>
          {progress.total > 0 && (
            <>
              <View style={snapshotStyles.track}>
                <View style={[snapshotStyles.fill, { width: `${Math.max(3, ratio * 100)}%` }]} />
              </View>
              <Text style={snapshotStyles.count}>
                {progress.current} of {progress.total}
              </Text>
            </>
          )}
          <Text style={snapshotStyles.note}>Keep the app open until this finishes.</Text>
        </View>
      </View>
    </Modal>
  );
}

const snapshotStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 28,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "rgba(8,8,16,0.28)",
  },
  card: {
    width: "100%",
    maxWidth: 430,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#242238",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  title: { marginTop: 10, color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 17 },
  stage: { marginTop: 5, color: "rgba(255,255,255,0.72)", fontFamily: "Inter_400Regular", fontSize: 13 },
  track: { height: 7, width: "100%", marginTop: 14, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: "#8b5cf6" },
  count: { marginTop: 7, color: "rgba(255,255,255,0.62)", fontFamily: "Inter_500Medium", fontSize: 12 },
  note: { marginTop: 9, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular", fontSize: 12 },
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
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <UnlockProvider>
                  <SettingsProvider>
                    <RecordsProvider>
                      <RootLayoutNav />
                      <LocalSnapshotManager enabled={splashDone} />
                      <CompleteBackupReminderManager enabled={splashDone} />
                      {!splashDone && <AppSplash onDone={handleSplashDone} />}
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
