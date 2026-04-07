import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!username.trim() || !password.trim() || !confirm.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setIsLoading(true);
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await register(username.trim(), password);
    setIsLoading(false);
    if (result.success) {
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError(result.error ?? "Registration failed.");
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    inner: {
      flex: 1,
      paddingTop: Platform.OS === "web" ? 80 : insets.top + 20,
      paddingHorizontal: 28,
      paddingBottom: insets.bottom + 24,
    },
    backRow: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
    backBtn: { padding: 4 },
    backText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
      marginLeft: 4,
    },
    title: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 32,
    },
    form: { gap: 14 },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      marginBottom: 4,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    eyeBtn: { padding: 4 },
    errorBox: {
      backgroundColor: colors.destructive + "18",
      borderRadius: 10,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      flex: 1,
    },
    registerBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    registerBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 24,
      gap: 4,
    },
    footerText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    footerLink: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
  });

  return (
    <View style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={s.inner}>
          <View style={s.backRow}>
            <Pressable style={s.backBtn} onPress={() => router.back()}>
              <Feather name="arrow-left" size={20} color={colors.primary} />
            </Pressable>
            <Text style={s.backText}>Back</Text>
          </View>

          <Text style={s.title}>Create Account</Text>
          <Text style={s.subtitle}>Join Memory Records to start capturing your memories.</Text>

          <View style={s.form}>
            <View>
              <Text style={s.label}>Username</Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Choose a username"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable style={s.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>

            <View>
              <Text style={s.label}>Confirm Password</Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Repeat password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {error ? (
              <View style={s.errorBox}>
                <Feather name="alert-circle" size={14} color={colors.destructive} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable style={s.registerBtn} onPress={handleRegister} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={s.registerBtnText}>Create Account</Text>
              )}
            </Pressable>
          </View>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account?</Text>
            <Pressable onPress={() => router.back()}>
              <Text style={s.footerLink}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
