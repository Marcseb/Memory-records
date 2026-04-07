import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface MemoryRecord {
  id: string;
  imageUri: string;
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
}

const RecordsContext = createContext<RecordsContextType | null>(null);

const RECORDS_KEY = "mr_records";

export function RecordsProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECORDS_KEY);
        if (raw) {
          setRecords(JSON.parse(raw));
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const save = async (updated: MemoryRecord[]) => {
    await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
  };

  const addRecord = useCallback(async (record: MemoryRecord) => {
    setRecords((prev) => {
      const next = [record, ...prev];
      save(next);
      return next;
    });
  }, []);

  const updateRecord = useCallback(async (id: string, updates: Partial<MemoryRecord>) => {
    setRecords((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...updates } : r));
      save(next);
      return next;
    });
  }, []);

  const deleteRecord = useCallback(async (id: string) => {
    setRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      save(next);
      return next;
    });
  }, []);

  return (
    <RecordsContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, isLoading }}>
      {children}
    </RecordsContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecords must be used within RecordsProvider");
  return ctx;
}
