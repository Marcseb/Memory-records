import * as Linking from "expo-linking";
import { useSettings } from "@/context/SettingsContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

/**
 * Convert ISO date (yyyy-mm-dd) to European display format (dd-mm-yyyy).
 */
function isoToDMY(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Build the Obsidian note filename.
 *
 * Original:       dd-mm-yyyy_tag_NN        e.g. 24-04-2026_sports_01
 * After 1st edit: dd-mm-yyyy_tag_NN_v2     e.g. 24-04-2026_sports_01_v2
 * After 2nd edit: dd-mm-yyyy_tag_NN_v3     ...
 *
 * If the record already has a stored base filename, versioning is anchored to it
 * so renames caused by tag changes don't break the version chain.
 */
function buildFilename(record: MemoryRecord, tagOrder: number): string {
  const editCount = record.editCount ?? 0;

  // Base filename: use stored original if available, otherwise compute fresh
  let base: string;
  if (record.filename) {
    base = record.filename;
  } else {
    const dmy = isoToDMY(record.date);
    const primaryTag = record.tags?.[0];
    if (primaryTag) {
      const nn = String(tagOrder).padStart(2, "0");
      const yearPart = record.contextYear !== undefined ? `_${record.contextYear}` : "";
      base = sanitizeFilename(`${dmy}_${primaryTag}${yearPart}_${nn}`);
    } else {
      const yearPart = record.contextYear !== undefined ? `_${record.contextYear}` : "";
      base = sanitizeFilename(`${dmy}${yearPart}_${record.id.substring(0, 8)}`);
    }
  }

  if (editCount > 0) {
    return `${base}_v${editCount + 1}`;
  }
  return base;
}

function formatMarkdown(record: MemoryRecord, authorName?: string): string {
  const lines: string[] = [];

  lines.push(`**Date:** ${record.date}`);
  if (record.contextYear !== undefined) {
    lines.push(`**Memory year:** ${record.contextYear}`);
  }
  if (record.tags && record.tags.length > 0) {
    lines.push(`**Tags:** ${record.tags.map((t) => `#${t}`).join("  ")}`);
  }
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

export function useObsidian() {
  const { settings } = useSettings();
  const { records } = useRecords();

  const saveToObsidian = async (
    record: MemoryRecord
  ): Promise<ObsidianResult> => {
    if (!settings.vaultName.trim()) {
      return { ok: false, reason: "not_configured" };
    }

    // Compute sequential order number for the primary tag (first in array).
    // At the time of calling, the current record may or may not be in the
    // records list yet (React state batching), so we exclude it by id and add 1.
    const primaryTag = record.tags?.[0];
    const tagOrder = primaryTag
      ? records.filter((r) => r.tags?.[0] === primaryTag && r.id !== record.id).length + 1
      : 1;

    const filename = buildFilename(record, tagOrder);
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
      `&overwrite=false`;

    try {
      await Linking.openURL(uri);
      return { ok: true, filename };
    } catch (err) {
      console.warn("[Obsidian] openURL failed:", err);
      return { ok: false, reason: "open_failed", error: err };
    }
  };

  return { saveToObsidian };
}
