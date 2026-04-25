import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

interface User {
  username: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetCredentials: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USERS_KEY = "mr_users";
const SESSION_KEY = "mr_session";

function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + password.length.toString(36);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const session = await AsyncStorage.getItem(SESSION_KEY);
        if (session) {
          setUser(JSON.parse(session));
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const raw = await AsyncStorage.getItem(USERS_KEY);
      const users: Record<string, string> = raw ? JSON.parse(raw) : {};
      const key = username.toLowerCase().trim();
      const hashed = hashPassword(password);
      if (!users[key]) {
        return { success: false, error: "Account not found. Please register first." };
      }
      if (users[key] !== hashed) {
        return { success: false, error: "Incorrect password." };
      }
      const token = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const userData: User = { username: key, token };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(userData));
      setUser(userData);
      return { success: true };
    } catch {
      return { success: false, error: "Login failed. Please try again." };
    }
  };

  const register = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!username.trim() || username.trim().length < 3) {
        return { success: false, error: "Username must be at least 3 characters." };
      }
      if (password.length < 6) {
        return { success: false, error: "Password must be at least 6 characters." };
      }
      const raw = await AsyncStorage.getItem(USERS_KEY);
      const users: Record<string, string> = raw ? JSON.parse(raw) : {};
      const key = username.toLowerCase().trim();
      if (users[key]) {
        return { success: false, error: "Username already taken." };
      }
      users[key] = hashPassword(password);
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
      const token = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const userData: User = { username: key, token };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(userData));
      setUser(userData);
      return { success: true };
    } catch {
      return { success: false, error: "Registration failed. Please try again." };
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const resetCredentials = async () => {
    await AsyncStorage.removeItem(USERS_KEY);
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, resetCredentials }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
