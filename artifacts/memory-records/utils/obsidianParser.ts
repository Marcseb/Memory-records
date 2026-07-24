import { MemoryRecord } from "@/context/RecordsContext";

function extractField(content: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Handles both **Field:** and __Field:__ variants, and CRLF line endings
  const regex = new RegExp(
    `(?:\\*\\*|__)${escaped}:(?:\\*\\*|__)\\s*([^\\r\\n]+)`,
    "m"
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractNote(content: string): string {
  // Find the ## Note section; capture everything up to the next --- or end-of-file
  const match = content.match(
    /##\s*Note\s*[\r\n]+([\s\S]*?)(?:[\r\n]+---[\r\n]|[\r\n]+\*Created|$)/
  );
  return match ? match[1].trim() : "";
}

/**
 * Detect whether pasted/read text looks like a Memory Records Obsidian export.
 * Intentionally lenient — only requires a **Date:** line.
 */
export function isObsidianMarkdown(text: string): boolean {
  return (
    /\*\*Date:\*\*/.test(text) ||
    /__Date:__/.test(text) ||
    text.includes("Created with Memory Records app")
  );
}

export function parseObsidianNote(
  content: string
): Omit<MemoryRecord, "id"> | null {
  // Normalize CRLF → LF
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const dateStr = extractField(text, "Date");
  if (!dateStr) return null;

  const savedAt = extractField(text, "Saved at");
  const createdAt = savedAt ? Date.parse(savedAt) : Date.now();

  const record: Omit<MemoryRecord, "id"> = {
    date: dateStr,
    note: extractNote(text),
    savedToObsidian: true,
    createdAt: isNaN(createdAt) ? Date.now() : createdAt,
    editCount: 0,
  };

  const memoryYear = extractField(text, "Memory year");
  if (memoryYear) {
    const y = parseInt(memoryYear, 10);
    if (!isNaN(y)) record.contextYear = y;
  }

  const tagsStr = extractField(text, "Tags");
  if (tagsStr) {
    const tags = tagsStr
      .split(/[\s,]+/)
      .filter((t) => t.startsWith("#"))
      .map((t) => t.slice(1).toLowerCase())
      .filter(Boolean);
    if (tags.length > 0) record.tags = tags;
  }

  const photo = extractField(text, "Photo");
  if (photo) record.imageUri = photo;

  const emotion = extractField(text, "Emotion");
  if (emotion) record.emotion = emotion;

  const location = extractField(text, "Location");
  if (location) record.location = location;

  const coords = extractField(text, "Coordinates");
  if (coords) {
    const parts = coords.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      record.lat = parts[0];
      record.lng = parts[1];
    }
  }

  const versionStr = extractField(text, "Version");
  if (versionStr) {
    const vMatch = versionStr.match(/v(\d+)/);
    if (vMatch) {
      const v = parseInt(vMatch[1], 10);
      record.editCount = isNaN(v) ? 0 : Math.max(0, v - 1);
    }
  }

  return record;
}

export function parseMultipleObsidianNotes(
  content: string
): Array<Omit<MemoryRecord, "id">> {
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Split on occurrences of **Date:** that aren't at position 0
  const sections = text.split(/(?=\n\*\*Date:\*\*)/).filter((s) => s.trim());

  const results: Array<Omit<MemoryRecord, "id">> = [];
  for (const section of sections) {
    const parsed = parseObsidianNote(section);
    if (parsed) results.push(parsed);
  }
  return results;
}
