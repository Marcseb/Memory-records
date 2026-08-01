import * as Linking from "expo-linking";
import { useSettings } from "@/context/SettingsContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";

/**
 * Compute the stable base key for a record's filename.
 * Includes the primary tag and context year when present.
 *
 * Examples:
 *   date only          → "2026-08-01"
 *   date + tag         → "2026-08-01_sports"
 *   date + year        → "2026-08-01_1974"
 *   date + tag + year  → "2026-08-01_nice_1974"
 */
function filenameKey(record: MemoryRecord): string {
  const parts: string[] = [record.date];
  const primaryTag = record.tags?.[0];
  // Tags are already normalized to [a-z0-9-] by the app, but sanitize defensively.
  if (primaryTag) parts.push(primaryTag.replace(/[^a-z0-9-]/gi, "_"));
  if (record.contextYear !== undefined) parts.push(String(record.contextYear));
  return parts.join("_");
}

/**
 * Build the Obsidian note filename (without .md extension).
 *
 * Format: YYYY-MM-DD[_tag][_year][_N]
 * _N (≥ 2) is only appended when multiple records share the same
 * (date, primaryTag, contextYear) combination.
 */
function buildFilename(record: MemoryRecord, sameKeyOrder: number): string {
  const key = filenameKey(record);
  if (sameKeyOrder <= 1) return key;
  return `${key}_${sameKeyOrder}`;
}

function formatMarkdown(record: MemoryRecord, authorName?: string): string {
  const lines: string[] = [];

  lines.push(`**Date:** ${record.date}`);
  if (record.imageUri) lines.push(`**Photo:** ${record.imageUri}`);
  if (record.contextYear !== undefined) {
    lines.push(`**Memory year:** ${record.contextYear}`);
  }
  if (record.yearRank !== undefined) {
    lines.push(`**Year rank:** ${record.yearRank}`);
  }
  if (record.isHistoricalEvent) {
    lines.push(`**Event type:** ${record.eventScope === "national" ? "National" : "International"}`);
  }
  if (record.tags && record.tags.length > 0) {
    lines.push(`**Tags:** ${record.tags.map((t) => `#${t}`).join("  ")}`);
  }
  if (record.emotion) lines.push(`**Emotion:** ${record.emotion}`);
  if (record.location) lines.push(`**Location:** ${record.location}`);
  if (record.lat && record.lng) {
    lines.push(`**Coordinates:** ${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}`);
    const mapsUrl = `https://maps.google.com/?q=${record.lat.toFixed(5)},${record.lng.toFixed(5)}`;
    lines.push(`**Map:** [Open in Google Maps](${mapsUrl})`);
  }
  if (authorName) lines.push(`**Recorded by:** ${authorName}`);
  const editCount = record.editCount ?? 0;
  if (editCount > 0) lines.push(`**Version:** v${editCount + 1}`);
  lines.push(`**Saved at:** ${new Date(record.createdAt).toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Note");
  lines.push("");
  lines.push(record.note || "_No note added._");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`*Created with Memory Records app*`);
  return lines.join("\n");
}

export type ObsidianResult =
  | { ok: true; filename: string }
  | { ok: false; reason: "not_configured" | "open_failed"; error?: unknown };

export type ObsidianBulkResult = {
  exported: number;
  failed: number;
  total: number;
};

/**
 * Return the stable 1-based position of a record among all records that share
 * the same filename key (date + primaryTag + contextYear), sorted by createdAt.
 *
 * This is used by saveToObsidian (single) and buildAllExportData (bulk)
 * so both paths always produce the same filename for the same record.
 *
 * Examples — three records all tagged "nice", year 1974, on 2026-01-15:
 *   oldest  → 2026-01-15_nice_1974     (order 1, no suffix)
 *   middle  → 2026-01-15_nice_1974_2
 *   newest  → 2026-01-15_nice_1974_3
 *
 * Records that differ in tag or year never collide and always get order 1.
 */
export function sameDateOrder(record: MemoryRecord, allRecords: MemoryRecord[]): number {
  const key = filenameKey(record);
  const siblings = allRecords
    .filter((r) => filenameKey(r) === key)
    .sort((a, b) => a.createdAt - b.createdAt);
  const idx = siblings.findIndex((r) => r.id === record.id);
  // If the record isn't in the list yet (e.g. not yet saved to state), treat as last.
  return idx === -1 ? siblings.length + 1 : idx + 1;
}

/**
 * Build the full list of export files for all records.
 * Returns an array sorted by createdAt (oldest first), each entry with:
 *   - filename: "YYYY-MM-DD.md" (or "YYYY-MM-DD_2.md" for same-date duplicates)
 *   - content:  formatted Markdown body
 *
 * This is a pure function — no side effects, no file I/O.
 * The caller is responsible for writing or sharing the files.
 */
export function buildAllExportData(
  records: MemoryRecord[],
  authorName?: string
): Array<{ filename: string; content: string }> {
  const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);
  const keyCounts = new Map<string, number>();
  return sorted.map((record) => {
    const key = filenameKey(record);
    const order = (keyCounts.get(key) ?? 0) + 1;
    keyCounts.set(key, order);
    const base = buildFilename(record, order);
    return {
      filename: `${base}.md`,
      content: formatMarkdown(record, authorName),
    };
  });
}

export function useObsidian() {
  const { settings } = useSettings();
  const { records } = useRecords();

  const saveToObsidian = async (
    record: MemoryRecord
  ): Promise<ObsidianResult> => {
    if (!settings.vaultName.trim()) {
      return { ok: false, reason: "not_configured" };
    }

    // Stable 1-based position among same-date records (sorted by createdAt).
    // Using position rather than a headcount of "other records" ensures each
    // record gets a unique filename even when overwrite=true.
    const order = sameDateOrder(record, records);
    const filename = buildFilename(record, order);
    const content = formatMarkdown(record, settings.authorName || undefined);
    const filePath = settings.folder
      ? `${settings.folder}/${filename}`
      : filename;

    // NOTE: We intentionally skip Linking.canOpenURL() here.
    // On Android, custom URI schemes (obsidian://) require a <queries> manifest entry
    // to return true from canOpenURL; without it the check always returns false even
    // when Obsidian is installed. We call openURL directly and catch any error.
    const uri =
      `obsidian://actions-uri/note/create` +
      `?vault=${encodeURIComponent(settings.vaultName)}` +
      `&file=${encodeURIComponent(filePath)}` +
      `&content=${encodeURIComponent(content)}` +
      `&overwrite=true`;

    try {
      await Linking.openURL(uri);
      return { ok: true, filename };
    } catch (err) {
      console.warn("[Obsidian] openURL failed:", err);
      return { ok: false, reason: "open_failed", error: err };
    }
  };

  /**
   * Export every record to Obsidian one by one.
   * Filenames follow YYYY-MM-DD (with _2, _3 suffix for same-date duplicates).
   * overwrite=true so re-exports after edits update the file.
   */
  const exportAllToObsidian = async (): Promise<ObsidianBulkResult> => {
    if (!settings.vaultName.trim()) {
      return { exported: 0, failed: 0, total: 0 };
    }

    // Sort by createdAt ascending so the per-key counter matches the stable
    // order produced by sameDateOrder() in the single-record path.
    const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);
    const keyCounts = new Map<string, number>();

    let exported = 0;
    let failed = 0;

    for (const record of sorted) {
      const key = filenameKey(record);
      const order = (keyCounts.get(key) ?? 0) + 1;
      keyCounts.set(key, order);

      const filename = buildFilename(record, order);
      const content = formatMarkdown(record, settings.authorName || undefined);
      const filePath = settings.folder
        ? `${settings.folder}/${filename}`
        : filename;

      const uri =
        `obsidian://actions-uri/note/create` +
        `?vault=${encodeURIComponent(settings.vaultName)}` +
        `&file=${encodeURIComponent(filePath)}` +
        `&content=${encodeURIComponent(content)}` +
        `&overwrite=true`;

      try {
        await Linking.openURL(uri);
        exported++;
        // Small pause so Obsidian can process each note before the next arrives.
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.warn("[Obsidian] bulk export openURL failed:", err);
        failed++;
      }
    }

    return { exported, failed, total: records.length };
  };

  return { saveToObsidian, exportAllToObsidian };
}
