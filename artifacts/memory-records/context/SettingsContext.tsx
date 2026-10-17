import React, { createContext, useContext, useEffect, useState } from "react";
import { readJsonFile, writeJsonFile } from "@/utils/storage";

export type VoiceLanguage = "fr-FR" | "it-IT" | "en-US";

export const VOICE_LANGUAGES: { code: VoiceLanguage; label: string; flag: string }[] = [
  { code: "fr-FR", label: "Français", flag: "🇫🇷" },
  { code: "it-IT", label: "Italiano", flag: "🇮🇹" },
  { code: "en-US", label: "English", flag: "🇺🇸" },
];

export interface AppSettings {
  vaultName: string;
  folder: string;
  configured: boolean;
  voiceLanguage: VoiceLanguage;
  authorName: string;
  /** Maximum number of international historical events generated per year (default 2) */
  maxInternationalEvents: number;
  /** Maximum number of national historical events generated per year (default 2) */
  maxNationalEvents: number;
  /** Create one verified local snapshot per day when data changed. */
  automaticSnapshotsEnabled: boolean;
  /** Test-build-only simulated clock. Never used in normal or production builds. */
  snapshotTestDate?: string;
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const SETTINGS_FILE = "mr_settings.json";
const SETTINGS_LEGACY_KEY = "mr_obsidian_settings";

const DEFAULT_SETTINGS: AppSettings = {
  vaultName: "",
  folder: "Memory Records",
  configured: false,
  voiceLanguage: "fr-FR",
  authorName: "",
  maxInternationalEvents: 2,
  maxNationalEvents: 2,
  automaticSnapshotsEnabled: true,
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await readJsonFile<AppSettings>(SETTINGS_FILE, SETTINGS_LEGACY_KEY);
        if (saved) setSettings({ ...DEFAULT_SETTINGS, ...saved });
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const updateSettings = async (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    next.configured = !!next.vaultName.trim();
    await writeJsonFile(SETTINGS_FILE, next);
    setSettings(next);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
