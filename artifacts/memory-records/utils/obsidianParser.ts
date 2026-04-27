import { MemoryRecord } from "@/context/RecordsContext";

function extractField(content: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\*\\*${escaped}:\\*\\*\\s*(.+)`, "m");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractNote(content: string): string {
  const match = content.match(/##\s*Note\s*\n+([\s\S]*?)(?:\n---|\n\*Created)/);
  return match ? match[1].trim() : "";
}

export function isObsidianMarkdown(text: string): boolean {
  return (
    text.includes("Created with Memory Records app") ||
    (text.includes("**Date:**") && text.includes("## Note"))
  );
}

export function parseObsidianNote(
  content: string
): Omit<MemoryRecord, "id"> | null {
  if (!isObsidianMarkdown(content)) return null;

  const dateStr = extractField(content, "Date");
  if (!dateStr) return null;

  const savedAt = extractField(content, "Saved at");
  const createdAt = savedAt ? Date.parse(savedAt) : Date.now();

  const record: Omit<MemoryRecord, "id"> = {
    date: dateStr,
    note: extractNote(content),
    savedToObsidian: true,
    createdAt: isNaN(createdAt) ? Date.now() : createdAt,
  };

  const memoryYear = extractField(content, "Memory year");
  if (memoryYear) {
    const y = parseInt(memoryYear, 10);
    if (!isNaN(y)) record.contextYear = y;
  }

  const tagsStr = extractField(content, "Tags");
  if (tagsStr) {
    const tags = tagsStr
      .split(/[\s,]+/)
      .filter((t) => t.startsWith("#"))
      .map((t) => t.slice(1).toLowerCase())
      .filter(Boolean);
    if (tags.length > 0) record.tags = tags;
  }

  const location = extractField(content, "Location");
  if (location) record.location = location;

  const coords = extractField(content, "Coordinates");
  if (coords) {
    const parts = coords.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      record.lat = parts[0];
      record.lng = parts[1];
    }
  }

  const versionStr = extractField(content, "Version");
  if (versionStr) {
    const vMatch = versionStr.match(/v(\d+)/);
    if (vMatch) {
      const v = parseInt(vMatch[1], 10);
      record.editCount = isNaN(v) ? 0 : Math.max(0, v - 1);
    }
  } else {
    record.editCount = 0;
  }

  return record;
}

export function parseMultipleObsidianNotes(content: string): Array<Omit<MemoryRecord, "id">> {
  const delimiter = /(?=\*\*Date:\*\*)/g;
  const sections = content.split(delimiter).filter((s) => s.trim().length > 0);

  const results: Array<Omit<MemoryRecord, "id">> = [];
  for (const section of sections) {
    if (isObsidianMarkdown(section) || section.includes("**Date:**")) {
      const parsed = parseObsidianNote(section);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}
