import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useUnlock } from "@/context/UnlockContext";
import { useColors } from "@/hooks/useColors";
import { API_SERVER_URL } from "@/constants/api";

interface Props {
  visible: boolean;
  featureName: string; // e.g. "AI Interviewer" or "Historical Events"
  onClose: () => void;
  /** Called after a successful unlock so the parent can proceed immediately. */
  onUnlocked?: () => void;
}

function buildPayPalUrl(deviceToken: string): string {
  const notifyUrl = `${API_SERVER_URL}/api/unlock/paypal-ipn`;
  const params = new URLSearchParams({
    cmd: "_donations",
    business: "7AUYVWJE39NMQ",
    item_name: "Memory Records AI Features",
    amount: "5.00",
    currency_code: "EUR",
    custom: deviceToken,
    notify_url: notifyUrl,
  });
  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
}

export function UnlockModal({ visible, featureName, onClose, onUnlocked }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { checkStatus, activateCode, isChecking } = useUnlock();

  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeActivating, setCodeActivating] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [codeSectionOpen, setCodeSectionOpen] = useState(false);

  const deviceToken = user?.token ?? "—";

  const handlePayPal = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = buildPayPalUrl(deviceToken);
    await Linking.openURL(url);
  };

  const handleCheckPayment = async () => {
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    setCheckingPayment(true);
    await checkStatus();
    setCheckingPayment(false);
    // UnlockContext updated isAiUnlocked — if now true, close
    // We can't read the updated value directly here; parent watches isAiUnlocked
    // The parent's useEffect will close the modal when isAiUnlocked becomes true.
  };

  const handleActivateCode = async () => {
    const trimmed = codeInput.trim();
    if (!trimmed) { setCodeError("Enter your activation code"); return; }
    setCodeError(null);
    setCodeActivating(true);
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    const result = await activateCode(trimmed);
    setCodeActivating(false);
    if (result.ok) {
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onUnlocked?.();
      onClose();
    } else {
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCodeError(result.error ?? "Invalid code. Check it and try again.");
    }
  };

  const s = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: insets.bottom + 24,
      gap: 20,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 4,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.historical,
      borderWidth: 1.5,
      borderColor: colors.historicalBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    desc: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 21,
    },
    strong: {
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 6,
    },
    featureText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    deviceBox: {
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      padding: 12,
      gap: 4,
    },
    deviceLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    deviceToken: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      fontVariant: ["tabular-nums"],
    },
    paypalBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.historical,
      borderRadius: colors.radius,
      paddingVertical: 15,
      borderWidth: 1.5,
      borderColor: colors.historicalBorder,
    },
    paypalBtnText: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.historicalForeground,
    },
    checkBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 11,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    checkBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    codeToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "center",
    },
    codeToggleText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    codeInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      backgroundColor: colors.card,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    codeError: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
    },
    activateBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 13,
    },
    activateBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.headerRow}>
            <View style={s.iconBox}>
              <Feather name="zap" size={20} color={colors.historicalForeground} />
            </View>
            <Text style={s.title}>Unlock AI Features</Text>
            <Pressable style={s.closeBtn} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Description */}
          <Text style={s.desc}>
            <Text style={s.strong}>{featureName}</Text> is part of the AI feature pack.
            A small contribution of <Text style={s.strong}>€5</Text> unlocks all AI
            features permanently on this device and helps keep Memory Records free
            and open-source.
          </Text>

          {/* Feature list */}
          <View style={{ gap: 2 }}>
            <View style={s.featureRow}>
              <Feather name="cpu" size={15} color={colors.primary} />
              <Text style={s.featureText}>AI Interviewer — guided memory sessions</Text>
            </View>
            <View style={s.featureRow}>
              <Feather name="globe" size={15} color={colors.historicalForeground} />
              <Text style={s.featureText}>Historical Events — AI-written year context</Text>
            </View>
            <View style={s.featureRow}>
              <Feather name="video" size={15} color={colors.primary} />
              <Text style={s.featureText}>Video — attach video clips to memories</Text>
            </View>
          </View>

          {/* Device token (for manual code flow) */}
          <View style={s.deviceBox}>
            <Text style={s.deviceLabel}>Your device ID (include in PayPal message)</Text>
            <Text style={s.deviceToken} selectable>{deviceToken}</Text>
          </View>

          {/* PayPal button */}
          <Pressable style={s.paypalBtn} onPress={handlePayPal}>
            <Text style={{ fontSize: 20 }}>💙</Text>
            <Text style={s.paypalBtnText}>Contribute €5 via PayPal</Text>
            <Feather name="external-link" size={15} color={colors.historicalForeground} />
          </Pressable>

          {/* Check payment status */}
          <Pressable
            style={[s.checkBtn, (isChecking || checkingPayment) && { opacity: 0.6 }]}
            onPress={handleCheckPayment}
            disabled={isChecking || checkingPayment}
          >
            {(isChecking || checkingPayment) ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="refresh-cw" size={14} color={colors.primary} />
            )}
            <Text style={s.checkBtnText}>
              {(isChecking || checkingPayment) ? "Checking…" : "I've paid — check payment status"}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or use activation code</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Manual code section */}
          {!codeSectionOpen ? (
            <Pressable
              style={s.codeToggle}
              onPress={() => setCodeSectionOpen(true)}
              hitSlop={8}
            >
              <Feather name="key" size={14} color={colors.primary} />
              <Text style={s.codeToggleText}>I have an activation code</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 10 }}>
              <TextInput
                style={s.codeInput}
                placeholder="MR-XXXXXXXX"
                placeholderTextColor={colors.mutedForeground}
                value={codeInput}
                onChangeText={(v) => { setCodeInput(v); setCodeError(null); }}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleActivateCode}
              />
              {codeError && <Text style={s.codeError}>{codeError}</Text>}
              <Pressable
                style={[s.activateBtn, codeActivating && { opacity: 0.6 }]}
                onPress={handleActivateCode}
                disabled={codeActivating}
              >
                {codeActivating ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Feather name="unlock" size={16} color={colors.primaryForeground} />
                )}
                <Text style={s.activateBtnText}>
                  {codeActivating ? "Activating…" : "Activate"}
                </Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
