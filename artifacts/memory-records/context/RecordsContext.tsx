import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { readJsonFile, writeJsonFile, deleteJsonFile } from "@/utils/storage";

export interface MemoryRecord {
  id: string;
  imageUri?: string;
  videoUri?: string;
  videoThumbnailUri?: string;
  tags?: string[];
  emotion?: string;
  note: string;
  date: string;
  contextYear?: number;
  /** Ordering rank within the same contextYear group (1-based, ascending = earlier in year) */
  yearRank?: number;
  /** True for AI-generated historical event notes */
  isHistoricalEvent?: boolean;
  /** Scope of the historical event */
  eventScope?: "international" | "national";
  location?: string;
  lat?: number;
  lng?: number;
  savedToObsidian: boolean;
  createdAt: number;
  filename?: string;
  editCount?: number;
}

interface RecordsContextType {
  records: MemoryRecord[];
  addRecord: (record: MemoryRecord) => Promise<void>;
  updateRecord: (id: string, updates: Partial<MemoryRecord>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  importRecords: (incoming: MemoryRecord[], incomingTags: string[]) => Promise<void>;
  reorderWithinYear: (id: string, direction: "up" | "down") => Promise<void>;
  isLoading: boolean;
  knownTags: string[];
  addTag: (tag: string) => Promise<void>;
  deleteTag: (tag: string) => Promise<void>;
}

const RecordsContext = createContext<RecordsContextType | null>(null);

const RECORDS_FILE = "mr_records.json";
const TAGS_FILE = "mr_tags.json";
const RECORDS_LEGACY_KEY = "mr_records";
const TAGS_LEGACY_KEY = "mr_tags";

export function RecordsProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const savedRecords = await readJsonFile<MemoryRecord[]>(RECORDS_FILE, RECORDS_LEGACY_KEY);
        if (savedRecords) setRecords(savedRecords);
      } catch (e) {
        console.warn("[RecordsContext] Failed to load records:", e);
      } finally {
        setIsLoading(false);
      }

      try {
        const savedTags = await readJsonFile<string[]>(TAGS_FILE, TAGS_LEGACY_KEY);
        if (savedTags) setKnownTags(savedTags);
      } catch (e) {
        console.warn("[RecordsContext] Failed to load tags:", e);
      }
    })();
  }, []);

  const saveRecords = async (updated: MemoryRecord[]) => {
    await writeJsonFile(RECORDS_FILE, updated);
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

  const reorderWithinYear = useCallback(async (id: string, direction: "up" | "down") => {
    setRecords((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target || target.contextYear === undefined) return prev;

      const year = target.contextYear;

      // Sort all records in this year by current effective order
      const inYear = prev
        .filter((r) => r.contextYear === year)
        .sort((a, b) => {
          const rA = a.yearRank, rB = b.yearRank;
          if (rA !== undefined && rB !== undefined) return rA - rB;
          if (rA !== undefined) return -1;
          if (rB !== undefined) return 1;
          return b.createdAt - a.createdAt;
        });

      // Normalize: give every record in this year a consecutive rank
      const withRanks = inYear.map((r, i) => ({ ...r, yearRank: i + 1 }));

      const idx = withRanks.findIndex((r) => r.id === id);
      if (idx === -1) return prev;

      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= withRanks.length) return prev;

      // Swap the two ranks
      const tmp = withRanks[idx].yearRank!;
      withRanks[idx] = { ...withRanks[idx], yearRank: withRanks[swapIdx].yearRank! };
      withRanks[swapIdx] = { ...withRanks[swapIdx], yearRank: tmp };

      // Merge back into the full records list
      const rankMap = new Map(withRanks.map((r) => [r.id, r.yearRank!]));
      const next = prev.map((r) =>
        rankMap.has(r.id) ? { ...r, yearRank: rankMap.get(r.id) } : r
      );
      saveRecords(next);
      return next;
    });
  }, []);

  const importRecords = useCallback(async (incoming: MemoryRecord[], incomingTags: string[]) => {
    setRecords((prev) => {
      const existingIds = new Set(incoming.map((r) => r.id));
      const kept = prev.filter((r) => !existingIds.has(r.id));
      const next = [...incoming, ...kept].sort((a, b) => b.createdAt - a.createdAt);
      writeJsonFile(RECORDS_FILE, next);
      return next;
    });
    setKnownTags((prev) => {
      const merged = Array.from(new Set([...prev, ...incomingTags])).sort();
      writeJsonFile(TAGS_FILE, merged);
      return merged;
    });
  }, []);

  const addTag = useCallback(async (tag: string) => {
    const normalized = tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
    if (!normalized) return;
    setKnownTags((prev) => {
      if (prev.includes(normalized)) return prev;
      const next = [...prev, normalized].sort();
      writeJsonFile(TAGS_FILE, next);
      return next;
    });
  }, []);

  const deleteTag = useCallback(async (tag: string) => {
    setKnownTags((prev) => {
      const next = prev.filter((t) => t !== tag);
      writeJsonFile(TAGS_FILE, next);
      return next;
    });
  }, []);

  return (
    <RecordsContext.Provider value={{ records, addRecord, updateRecord, deleteRecord, importRecords, reorderWithinYear, isLoading, knownTags, addTag, deleteTag }}>
      {children}
    </RecordsContext.Provider>
  );
}

export function useRecords() {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecords must be used within RecordsProvider");
  return ctx;
}
