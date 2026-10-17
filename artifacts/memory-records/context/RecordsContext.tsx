import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { readJsonFile, writeJsonFile, deleteJsonFile, deleteAppVideo, deleteAppAudio } from "@/utils/storage";
import { markRecordChangedForCompleteBackup } from "@/utils/completeBackupReminder";

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
  audioUri?: string;
  savedToObsidian: boolean;
  createdAt: number;
  filename?: string;
  editCount?: number;
  /** Duration of the attached video clip in milliseconds */
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
  const recordsRef = useRef<MemoryRecord[]>([]);
  const tagsRef = useRef<string[]>([]);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());

  const enqueueMutation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.current.then(operation, operation);
    mutationQueue.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const savedRecords = await readJsonFile<MemoryRecord[]>(RECORDS_FILE, RECORDS_LEGACY_KEY);
        if (savedRecords) {
          recordsRef.current = savedRecords;
          setRecords(savedRecords);
        }
      } catch (e) {
        console.warn("[RecordsContext] Failed to load records:", e);
      }
      try {
        const savedTags = await readJsonFile<string[]>(TAGS_FILE, TAGS_LEGACY_KEY);
        if (savedTags) {
          tagsRef.current = savedTags;
          setKnownTags(savedTags);
        }
      } catch (e) {
        console.warn("[RecordsContext] Failed to load tags:", e);
      } finally {
        // Snapshot and other startup work must not observe records before the
        // companion tag file has finished loading.
        setIsLoading(false);
      }
    })();
  }, []);

  const addRecord = useCallback((record: MemoryRecord) => enqueueMutation(async () => {
    const next = [record, ...recordsRef.current];
    await writeJsonFile(RECORDS_FILE, next);
    recordsRef.current = next;
    setRecords(next);
    await markRecordChangedForCompleteBackup(record.id);
  }), [enqueueMutation]);

  const updateRecord = useCallback((id: string, updates: Partial<MemoryRecord>) => enqueueMutation(async () => {
      const existing = recordsRef.current.find((record) => record.id === id);
      const next = recordsRef.current.map((record) =>
        record.id === id ? { ...record, ...updates } : record,
      );
      await writeJsonFile(RECORDS_FILE, next);
      recordsRef.current = next;
      setRecords(next);
      await markRecordChangedForCompleteBackup(id);

      // Delete replaced app-owned media only after the updated record is durable.
      if (
        existing?.videoUri &&
        "videoUri" in updates &&
        updates.videoUri !== existing.videoUri
      ) {
        deleteAppVideo(existing.videoUri).catch(() => {});
      }
      // If the audio is being replaced or removed, delete the old file.
      if (
        existing?.audioUri &&
        "audioUri" in updates &&
        updates.audioUri !== existing.audioUri
      ) {
        deleteAppAudio(existing.audioUri).catch(() => {});
      }
  }), [enqueueMutation]);

  const deleteRecord = useCallback((id: string) => enqueueMutation(async () => {
      const target = recordsRef.current.find((record) => record.id === id);
      const next = recordsRef.current.filter((record) => record.id !== id);
      await writeJsonFile(RECORDS_FILE, next);
      recordsRef.current = next;
      setRecords(next);

      // Delete media only after the record removal is durable.
      if (target?.videoUri) {
        deleteAppVideo(target.videoUri).catch(() => {});
      }
      if (target?.audioUri) {
        deleteAppAudio(target.audioUri).catch(() => {});
      }
  }), [enqueueMutation]);

  const reorderWithinYear = useCallback((id: string, direction: "up" | "down") =>
    enqueueMutation(async () => {
      const current = recordsRef.current;
      const target = current.find((record) => record.id === id);
      if (!target || target.contextYear === undefined) return;

      const year = target.contextYear;

      // Sort all records in this year by current effective order
      const inYear = current
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
      if (idx === -1) return;

      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= withRanks.length) return;

      // Swap the two ranks
      const tmp = withRanks[idx].yearRank!;
      withRanks[idx] = { ...withRanks[idx], yearRank: withRanks[swapIdx].yearRank! };
      withRanks[swapIdx] = { ...withRanks[swapIdx], yearRank: tmp };

      // Merge back into the full records list
      const rankMap = new Map(withRanks.map((r) => [r.id, r.yearRank!]));
      const next = current.map((r) =>
        rankMap.has(r.id) ? { ...r, yearRank: rankMap.get(r.id) } : r
      );
      await writeJsonFile(RECORDS_FILE, next);
      recordsRef.current = next;
      setRecords(next);
    }), [enqueueMutation]);

  const importRecords = useCallback((incoming: MemoryRecord[], incomingTags: string[]) =>
    enqueueMutation(async () => {
    const incomingIds = new Set(incoming.map((record) => record.id));
    const kept = recordsRef.current.filter((record) => !incomingIds.has(record.id));
    const nextRecords = [...incoming, ...kept].sort((a, b) => b.createdAt - a.createdAt);
    const nextTags = Array.from(new Set([...tagsRef.current, ...incomingTags])).sort();

    await writeJsonFile(TAGS_FILE, nextTags);
    await writeJsonFile(RECORDS_FILE, nextRecords);
    recordsRef.current = nextRecords;
    tagsRef.current = nextTags;
    setRecords(nextRecords);
    setKnownTags(nextTags);
  }), [enqueueMutation]);

  const addTag = useCallback((tag: string) => enqueueMutation(async () => {
    const normalized = tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
    if (!normalized) return;
    if (tagsRef.current.includes(normalized)) return;
    const next = [...tagsRef.current, normalized].sort();
    await writeJsonFile(TAGS_FILE, next);
    tagsRef.current = next;
    setKnownTags(next);
  }), [enqueueMutation]);

  const deleteTag = useCallback((tag: string) => enqueueMutation(async () => {
    const next = tagsRef.current.filter((value) => value !== tag);
    await writeJsonFile(TAGS_FILE, next);
    tagsRef.current = next;
    setKnownTags(next);
  }), [enqueueMutation]);

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
