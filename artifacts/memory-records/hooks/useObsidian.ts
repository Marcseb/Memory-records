import * as Linking from "expo-linking";
import { useSettings } from "@/context/SettingsContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";

/**
 * Build the Obsidian note filename.
 *
 * Format: YYYY-MM-DD
 * Same-date duplicates: YYYY-MM-DD_2, YYYY-MM-DD_3, …
 *
 * sameDateOrder is 1-based: 1 = first note on that date (no suffix).
 */
function buildFilename(record: MemoryRecord, sameDateOrder: number): string {
  if (sameDateOrder <= 1) return record.date;
  return `${record.date}_${sameDateOrder}`;
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
 * its date, sorted ascending by createdAt.
 *
 * This is used by both saveToObsidian (single) and exportAllToObsidian (bulk)
 * so the two paths always produce the same filename for the same record.
 *
 * Examples (three records on 2026-01-15, oldest first):
 *   oldest  → 2026-01-15        (order 1, no suffix)
 *   middle  → 2026-01-15_2
 *   newest  → 2026-01-15_3
 */
export function sameDateOrder(record: MemoryRecord, allRecords: MemoryRecord[]): number {
  const siblings = allRecords
    .filter((r) => r.date === record.date)
    .sort((a, b) => a.createdAt - b.createdAt);
  const idx = siblings.findIndex((r) => r.id === record.id);
  // If the record isn't found (e.g. not yet saved to state), treat it as last.
  return idx === -1 ? siblings.length + 1 : idx + 1;
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

    // Sort by createdAt ascending so the per-date counter matches the stable
    // order produced by sameDateOrder() in the single-record path.
    const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);
    const dateCounts = new Map<string, number>();

    let exported = 0;
    let failed = 0;

    for (const record of sorted) {
      const order = (dateCounts.get(record.date) ?? 0) + 1;
      dateCounts.set(record.date, order);

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
