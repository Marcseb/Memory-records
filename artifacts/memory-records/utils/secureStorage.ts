import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

function getWebStorage(): Storage | null {
  if (Platform.OS !== "web" || typeof globalThis.localStorage === "undefined") {
    return null;
  }
  return globalThis.localStorage;
}

export async function getSecureItem(key: string): Promise<string | null> {
  const webStorage = getWebStorage();
  if (Platform.OS === "web") return webStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  const webStorage = getWebStorage();
  if (Platform.OS === "web") {
    webStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  const webStorage = getWebStorage();
  if (Platform.OS === "web") {
    webStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}