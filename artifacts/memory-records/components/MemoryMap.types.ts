import type { MemoryRecord } from "@/context/RecordsContext";

export type LocatedRecord = MemoryRecord & { lat: number; lng: number };

export interface MemoryMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MemoryMapProps {
  records: LocatedRecord[];
  initialRegion: MemoryMapRegion;
  onOpenRecord: (record: LocatedRecord) => void;
}

export function getMapRecordTitle(record: MemoryRecord) {
  const firstLine = record.note.trim().split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) return "Memory";
  return firstLine.length > 64 ? `${firstLine.slice(0, 61).trimEnd()}…` : firstLine;
}

export function getMapLocationLabel(record: LocatedRecord) {
  return record.location?.trim() ||
    `${record.lat.toFixed(4)}, ${record.lng.toFixed(4)}`;
}
