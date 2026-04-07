import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type VoiceLanguage = "fr-FR" | "it-IT" | "en-US";

export const VOICE_LANGUAGES: { code: VoiceLanguage; label: string; flag: string }[] = [
  { code: "fr-FR", label: "Français", flag: "🇫🇷" },
  { code: "it-IT", label: "Italiano", flag: "🇮🇹" },
  { code: "en-US", label: "English", flag: "🇺🇸" },
];

interface AppSettings {
  vaultName: string;
  folder: string;
  configured: boolean;
  voiceLanguage: VoiceLanguage;
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const SETTINGS_KEY = "mr_obsidian_settings";

const DEFAULT_SETTINGS: AppSettings = {
  vaultName: "",
  folder: "Memory Records",
  configured: false,
  voiceLanguage: "fr-FR",
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const updateSettings = async (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    next.configured = !!next.vaultName.trim();
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
