import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { APP_LOCK_PIN_LENGTH, isValidAppPin, useAppLock } from "@/context/AppLockContext";
import { useColors } from "@/hooks/useColors";

export function AppLockScreen({ active }: { active: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isReady, isSupported, isEnabled, isLocked, verifyPin, unlock } =
    useAppLock();
  const [pinEntryVisible, setPinEntryVisible] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isCheckingPin, setIsCheckingPin] = useState(false);
  const [isCheckingBiometrics, setIsCheckingBiometrics] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const attemptedBiometrics = useRef(false);
  const pinInput = useRef<TextInput | null>(null);

  const visible = active && isReady && isSupported && isEnabled && isLocked;

  const tryBiometrics = useCallback(async () => {
    setIsCheckingBiometrics(true);
    setError("");
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      const available = hasHardware && isEnrolled;
      setBiometricsAvailable(available);
      if (!available) {
        setPinEntryVisible(true);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Memory Records",
        promptSubtitle: "Confirm it's you to open your memories.",
        cancelLabel: "Use PIN",
        fallbackLabel: "Use PIN",
        disableDeviceFallback: true,
        biometricsSecurityLevel: "strong",
      });

      if (result.success) {
        Keyboard.dismiss();
        setPin("");
        unlock();
        return;
      }

      setPinEntryVisible(true);
      if (
        result.error !== "user_cancel" &&
        result.error !== "user_fallback" &&
        result.error !== "app_cancel" &&
        result.error !== "system_cancel"
      ) {
        setError("Biometric unlock did not work. Enter your app PIN.");
      }
    } catch (authError) {
      console.warn("[AppLock] Biometric unlock failed:", authError);
      setPinEntryVisible(true);
      setError("Biometric unlock is unavailable. Enter your app PIN.");
    } finally {
      setIsCheckingBiometrics(false);
    }
  }, [unlock]);

  useEffect(() => {
    if (!visible || attemptedBiometrics.current) return;
    attemptedBiometrics.current = true;
    void tryBiometrics();
  }, [tryBiometrics, visible]);

  useEffect(() => {
    if (!visible) {
      attemptedBiometrics.current = false;
      setPin("");
      setError("");
      setPinEntryVisible(false);
      setBiometricsAvailable(false);
    }
  }, [visible]);

  useEffect(() => {
    if (pinEntryVisible) {
      const timer = setTimeout(() => pinInput.current?.focus(), 120);
      return () => clearTimeout(timer);
    }
  }, [pinEntryVisible]);

  const submitPin = async () => {
    if (!isValidAppPin(pin)) {
      setError("Enter all 4 digits of your PIN.");
      return;
    }
    setIsCheckingPin(true);
    setError("");
    try {
      if (await verifyPin(pin)) {
        Keyboard.dismiss();
        setPin("");
        unlock();
      } else {
        setPin("");
        setError("That PIN is not correct. Try again.");
      }
    } catch (verifyError) {
      console.warn("[AppLock] PIN verification failed:", verifyError);
      setPin("");
      setError("PIN verification is temporarily unavailable.");
    } finally {
      setIsCheckingPin(false);
    }
  };

  const styles = StyleSheet.create({
    modal: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboard: {
      flex: 1,
    },
    content: {
      flex: 1,
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
      paddingTop: Math.max(insets.top, 12) + 20,
      paddingBottom: Math.max(insets.bottom, 12) + 24,
    },
    iconCircle: {
      width: 76,
      height: 76,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 38,
      backgroundColor: colors.primary + "18",
      marginBottom: 20,
    },
    title: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 23,
      textAlign: "center",
    },
    description: {
      maxWidth: 300,
      marginTop: 9,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    input: {
      width: "100%",
      maxWidth: 270,
      height: 54,
      marginTop: 26,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: error ? colors.destructive : colors.border,
      borderRadius: colors.radius,
      backgroundColor: colors.surfaceElevated,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 22,
      letterSpacing: 12,
      textAlign: "center",
    },
    error: {
      marginTop: 10,
      color: colors.destructive,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      textAlign: "center",
    },
    button: {
      width: "100%",
      maxWidth: 270,
      minHeight: 50,
      marginTop: 18,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
    },
    buttonText: {
      color: colors.primaryForeground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
    },
    linkButton: {
      minHeight: 44,
      marginTop: 9,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    linkText: {
      color: colors.primary,
      fontFamily: "Inter_500Medium",
      fontSize: 14,
    },
  });

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.modal}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Feather name="lock" size={30} color={colors.primary} />
            </View>
            <Text style={styles.title}>Memory Records is locked</Text>
            <Text style={styles.description}>
              Unlock with your face or fingerprint, or enter your 4-digit app PIN.
            </Text>

            {pinEntryVisible ? (
              <>
                <TextInput
                  ref={pinInput}
                  value={pin}
                  onChangeText={(value) =>
                    setPin(value.replace(/\D/g, "").slice(0, APP_LOCK_PIN_LENGTH))
                  }
                  style={styles.input}
                  placeholder="••••"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={APP_LOCK_PIN_LENGTH}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="4-digit app PIN"
                  returnKeyType="done"
                  onSubmitEditing={() => void submitPin()}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void submitPin()}
                  disabled={isCheckingPin || pin.length !== APP_LOCK_PIN_LENGTH}
                  style={({ pressed }) => [
                    styles.button,
                    (pressed || isCheckingPin) && { opacity: 0.78 },
                    pin.length !== APP_LOCK_PIN_LENGTH && { opacity: 0.55 },
                  ]}
                >
                  <Text style={styles.buttonText}>
                    {isCheckingPin ? "Checking…" : "Unlock with PIN"}
                  </Text>
                </Pressable>
                {biometricsAvailable ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void tryBiometrics()}
                    disabled={isCheckingBiometrics}
                    style={styles.linkButton}
                  >
                    <MaterialCommunityIcons
                      name="fingerprint"
                      size={19}
                      color={colors.primary}
                    />
                    <Text style={styles.linkText}>
                      {isCheckingBiometrics ? "Checking…" : "Try biometrics again"}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPinEntryVisible(true)}
                  disabled={isCheckingBiometrics}
                  style={styles.button}
                >
                  <Feather name="key" size={17} color={colors.primaryForeground} />
                  <Text style={styles.buttonText}>Enter PIN</Text>
                </Pressable>
                {isCheckingBiometrics ? (
                  <Text style={styles.description}>Waiting for device authentication…</Text>
                ) : null}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

type PinFlow = "setup" | "change";
type PinStep = "current" | "new" | "confirm";

export function AppLockSettings() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    isReady,
    isSupported,
    isEnabled,
    hasPin,
    setEnabled,
    savePin,
    verifyPin,
  } = useAppLock();
  const [pinFlow, setPinFlow] = useState<PinFlow | null>(null);
  const [pinStep, setPinStep] = useState<PinStep>("new");
  const [pinDraft, setPinDraft] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const pinInput = useRef<TextInput | null>(null);

  const startPinFlow = (flow: PinFlow) => {
    setPinFlow(flow);
    setPinStep(flow === "change" ? "current" : "new");
    setPinDraft("");
    setFirstPin("");
    setError("");
  };

  const closePinFlow = () => {
    if (isBusy) return;
    Keyboard.dismiss();
    setPinFlow(null);
    setPinDraft("");
    setFirstPin("");
    setError("");
  };

  useEffect(() => {
    if (!pinFlow) return;
    const timer = setTimeout(() => pinInput.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [pinFlow, pinStep]);

  const handleToggle = async (nextEnabled: boolean) => {
    setToggleError("");
    if (nextEnabled && !hasPin) {
      startPinFlow("setup");
      return;
    }
    setIsBusy(true);
    try {
      await setEnabled(nextEnabled);
    } catch (toggleFailure) {
      setToggleError(
        toggleFailure instanceof Error
          ? toggleFailure.message
          : "Could not update the app lock.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const submitPinStep = async () => {
    if (!isValidAppPin(pinDraft)) {
      setError("Enter exactly 4 digits.");
      return;
    }
    if (!pinFlow) return;

    setError("");
    setIsBusy(true);
    try {
      if (pinStep === "current") {
        if (!(await verifyPin(pinDraft))) {
          setPinDraft("");
          setError("The current PIN is not correct.");
          return;
        }
        setPinDraft("");
        setPinStep("new");
        return;
      }

      if (pinStep === "new") {
        setFirstPin(pinDraft);
        setPinDraft("");
        setPinStep("confirm");
        return;
      }

      if (pinDraft !== firstPin) {
        setPinDraft("");
        setFirstPin("");
        setPinStep("new");
        setError("The PINs did not match. Enter a new PIN again.");
        return;
      }

      await savePin(pinDraft);
      const shouldEnableLock = pinFlow === "setup";
      setPinFlow(null);
      setPinDraft("");
      setFirstPin("");
      Keyboard.dismiss();

      if (shouldEnableLock) {
        try {
          await setEnabled(true);
        } catch (enableFailure) {
          Alert.alert(
            "PIN saved, but app lock is off",
            enableFailure instanceof Error
              ? enableFailure.message
              : "Try enabling the app lock again in Settings.",
          );
        }
      } else {
        Alert.alert("PIN changed", "Your new app PIN is now saved securely.");
      }
    } catch (saveFailure) {
      setError(
        saveFailure instanceof Error
          ? saveFailure.message
          : "Could not save the PIN securely.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const styles = StyleSheet.create({
    card: {
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      backgroundColor: colors.surfaceElevated,
    },
    row: {
      minHeight: 68,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    rowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowContent: {
      flex: 1,
      gap: 3,
    },
    rowLabel: {
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
      fontSize: 14,
    },
    rowDescription: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 17,
    },
    changeRow: {
      minHeight: 52,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    changeText: {
      flex: 1,
      color: colors.primary,
      fontFamily: "Inter_500Medium",
      fontSize: 14,
    },
    hint: {
      marginTop: 8,
      paddingHorizontal: 2,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 17,
    },
    toggleError: {
      marginTop: 8,
      color: colors.destructive,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
    },
    modal: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalContent: {
      flex: 1,
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
      paddingHorizontal: 24,
      paddingTop: Math.max(insets.top, 12) + 18,
      paddingBottom: Math.max(insets.bottom, 12) + 20,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 26,
    },
    closeButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
    },
    modalTitle: {
      flex: 1,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 19,
    },
    modalStep: {
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      fontSize: 12,
    },
    modalPrompt: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 22,
      lineHeight: 29,
    },
    modalDescription: {
      marginTop: 8,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      lineHeight: 20,
    },
    modalInput: {
      width: "100%",
      height: 56,
      marginTop: 25,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: error ? colors.destructive : colors.border,
      borderRadius: colors.radius,
      backgroundColor: colors.surfaceElevated,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 22,
      letterSpacing: 12,
      textAlign: "center",
    },
    modalError: {
      marginTop: 10,
      color: colors.destructive,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
    },
    modalSpacer: {
      flex: 1,
      minHeight: 24,
    },
    primaryButton: {
      minHeight: 52,
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      color: colors.primaryForeground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 15,
    },
  });

  const currentStepNumber =
    pinFlow === "setup" ? (pinStep === "new" ? 1 : 2) : pinStep === "current" ? 1 : pinStep === "new" ? 2 : 3;
  const totalSteps = pinFlow === "setup" ? 2 : 3;
  const prompt =
    pinStep === "current"
      ? "Enter your current PIN"
      : pinStep === "new"
        ? "Create a 4-digit PIN"
        : "Confirm your new PIN";

  return (
    <View>
      <View style={styles.card}>
        <View style={[styles.row, hasPin && styles.rowBorder]}>
          <Feather name="shield" size={19} color={colors.primary} />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Lock app on open</Text>
            <Text style={styles.rowDescription}>
              {isSupported
                ? "Use Face ID or fingerprint when available, with your PIN as fallback."
                : "App lock is available in the Android and iOS apps."}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Lock app on open"
            value={isEnabled}
            onValueChange={(value) => void handleToggle(value)}
            disabled={!isSupported || !isReady || isBusy}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surfaceElevated}
          />
        </View>
        {hasPin ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => startPinFlow("change")}
            disabled={!isSupported || !isReady || isBusy}
            style={({ pressed }) => [
              styles.changeRow,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Feather name="key" size={17} color={colors.primary} />
            <Text style={styles.changeText}>Change PIN</Text>
            <Feather
              name="chevron-right"
              size={17}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {isSupported && !hasPin ? (
        <Text style={styles.hint}>A 4-digit PIN is created when you turn the lock on.</Text>
      ) : null}
      {toggleError ? <Text style={styles.toggleError}>{toggleError}</Text> : null}

      <Modal
        visible={pinFlow !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closePinFlow}
      >
        <View style={styles.modal}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior="padding"
            keyboardVerticalOffset={0}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel PIN change"
                  onPress={closePinFlow}
                  disabled={isBusy}
                  style={styles.closeButton}
                >
                  <Feather name="x" size={20} color={colors.foreground} />
                </Pressable>
                <Text style={styles.modalTitle}>
                  {pinFlow === "setup" ? "Set app PIN" : "Change app PIN"}
                </Text>
                <Text style={styles.modalStep}>
                  {currentStepNumber} of {totalSteps}
                </Text>
              </View>
              <Text style={styles.modalPrompt}>{prompt}</Text>
              <Text style={styles.modalDescription}>
                {pinStep === "current"
                  ? "Verify your existing PIN before changing it."
                  : pinStep === "new"
                    ? "Choose four digits that you can remember."
                    : "Enter the same four digits once more to save the PIN."}
              </Text>
              <TextInput
                ref={pinInput}
                value={pinDraft}
                onChangeText={(value) =>
                  setPinDraft(value.replace(/\D/g, "").slice(0, APP_LOCK_PIN_LENGTH))
                }
                style={styles.modalInput}
                placeholder="••••"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={APP_LOCK_PIN_LENGTH}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={prompt}
                returnKeyType="done"
                onSubmitEditing={() => void submitPinStep()}
              />
              {error ? <Text style={styles.modalError}>{error}</Text> : null}
              <View style={styles.modalSpacer} />
              <Pressable
                accessibilityRole="button"
                onPress={() => void submitPinStep()}
                disabled={isBusy || pinDraft.length !== APP_LOCK_PIN_LENGTH}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || isBusy) && { opacity: 0.78 },
                  pinDraft.length !== APP_LOCK_PIN_LENGTH && { opacity: 0.55 },
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isBusy
                    ? "Saving…"
                    : pinStep === "confirm"
                      ? pinFlow === "setup"
                        ? "Save PIN and turn on lock"
                        : "Save new PIN"
                      : "Continue"}
                </Text>
                {!isBusy ? (
                  <Feather
                    name={pinStep === "confirm" ? "check" : "arrow-right"}
                    size={17}
                    color={colors.primaryForeground}
                  />
                ) : null}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
