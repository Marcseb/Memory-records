import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

interface User {
  username: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  resetAllData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const IDENTITY_KEY = "mr_identity";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(IDENTITY_KEY);
        if (raw) {
          setUser(JSON.parse(raw));
        } else {
          const identity: User = {
            username: "local",
            token: Date.now().toString() + Math.random().toString(36).slice(2, 9),
          };
          await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
          setUser(identity);
        }
      } catch {
        setUser({ username: "local", token: "fallback" });
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const resetAllData = async () => {
    await AsyncStorage.multiRemove([
      IDENTITY_KEY,
      "mr_records",
      "mr_tags",
      "mr_obsidian_settings",
      "mr_session",
      "mr_users",
    ]);
    const identity: User = {
      username: "local",
      token: Date.now().toString() + Math.random().toString(36).slice(2, 9),
    };
    await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    setUser(identity);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, resetAllData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
