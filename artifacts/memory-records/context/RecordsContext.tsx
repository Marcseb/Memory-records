import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface MemoryRecord {
  id: string;
  imageUri?: string;
  tag?: string;
  note: string;
  date: string;
  location?: string;
  lat?: number;
  lng?: number;
  savedToObsidian: boolean;
  createdAt: number;
  filename?: string;
}

interface RecordsContextType {
  records: MemoryRecord[];
  addRecord: (record: MemoryRecord) => Promise<void>;
  updateRecord: (id: string, updates: Partial<MemoryRecord>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  isLoading: boolean;
  knownTags: string[];
  addTag: (tag: string) => Promise<void>;
}

const RecordsContext = createContext<RecordsContextType | null>(null);

const RECORDS_KEY = "mr_records";
const TAGS_KEY = "mr_tags";

export function RecordsProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rawRecords = await AsyncStorage.getItem(RECORDS_KEY);
        if (rawRecords) {
          try {
            setRecords(JSON.parse(rawRecords));
          } catch (e) {
            console.warn("[RecordsContext] Failed to parse records:", e);
          }
        }
      } catch (e) {
        console.warn("[RecordsContext] Failed to load records:", e);
      } finally {
        setIsLoading(false);
      }

      try {
        const rawTags = await AsyncStorage.getItem(TAGS_KEY);
        if (rawTags) {
          try {
            setKnownTags(JSON.parse(rawTags));
          } catch (e) {
            console.warn("[RecordsContext] Failed to parse tags:", e);
          }
        }
      } catch (e) {
        console.warn("[RecordsContext] Failed to load tags:", e);
      }
    })();
  }, []);

  const saveRecords = async (updated: MemoryRecord[]) => {
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
  };

  const addRecord = useCallback(async (record: MemoryRecord) => {
    setRecords((prev) => {
      const next = [record, ...prev];
      saveRecords(next);
      return next;
    });
  }, []);

  const updateRecord = useCallback(async (id: string, updates: Partial<MemoryRecord>) => {
    setRecords((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...updates } : r));
      saveRecords(next);
      return next;
    });
  }, []);

  const deleteRecord = useCallback(async (id: string) => {
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveRecords(next);
      return next;
    });
  }, []);

  const addTag = useCallback(async (tag: string) => {
    const normalized = tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
    if (!normalized) return;
    setKnownTags((prev) => {
      if (prev.includes(normalized)) return prev;
      const next = [...prev, normalized].sort();
      AsyncStorage.setItem(TAGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <RecordsContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, isLoading, knownTags, addTag }}>
      {children}
    </RecordsContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecords must be used within RecordsProvider");
  return ctx;
}
