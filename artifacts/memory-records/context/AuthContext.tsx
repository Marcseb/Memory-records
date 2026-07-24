import React, { createContext, useContext, useEffect, useState } from "react";
import { readJsonFile, writeJsonFile, deleteJsonFile } from "@/utils/storage";

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

const IDENTITY_FILE = "mr_identity.json";
const IDENTITY_LEGACY_KEY = "mr_identity";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        let identity = await readJsonFile<User>(IDENTITY_FILE, IDENTITY_LEGACY_KEY);
        if (!identity) {
          identity = {
            username: "local",
            token: Date.now().toString() + Math.random().toString(36).slice(2, 9),
          };
          await writeJsonFile(IDENTITY_FILE, identity);
        }
        setUser(identity);
      } catch {
        setUser({ username: "local", token: "fallback" });
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const resetAllData = async () => {
    await Promise.all([
      deleteJsonFile(IDENTITY_FILE),
      deleteJsonFile("mr_records.json"),
      deleteJsonFile("mr_tags.json"),
      deleteJsonFile("mr_settings.json"),
    ]);
    const identity: User = {
      username: "local",
      token: Date.now().toString() + Math.random().toString(36).slice(2, 9),
    };
    await writeJsonFile(IDENTITY_FILE, identity);
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
