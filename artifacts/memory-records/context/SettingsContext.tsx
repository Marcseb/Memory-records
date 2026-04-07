import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

interface ObsidianSettings {
  vaultName: string;
  folder: string;
  configured: boolean;
}

interface SettingsContextType {
  settings: ObsidianSettings;
  updateSettings: (updates: Partial<ObsidianSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const SETTINGS_KEY = "mr_obsidian_settings";

const DEFAULT_SETTINGS: ObsidianSettings = {
  vaultName: "",
  folder: "Memory Records",
  configured: false,
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ObsidianSettings>(DEFAULT_SETTINGS);

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

  const updateSettings = async (updates: Partial<ObsidianSettings>) => {
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
