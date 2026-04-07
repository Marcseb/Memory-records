import * as Linking from "expo-linking";
import { useSettings } from "@/context/SettingsContext";
import { MemoryRecord } from "@/context/RecordsContext";

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function formatMarkdown(record: MemoryRecord, username: string): string {
  const lines: string[] = [];
  lines.push(`# Memory Record — ${record.date}`);
  lines.push("");
  lines.push(`**Date:** ${record.date}`);
  if (record.location) {
    lines.push(`**Location:** ${record.location}`);
  }
  if (record.lat && record.lng) {
    lines.push(`**Coordinates:** ${record.lat.toFixed(5)}, ${record.lng.toFixed(5)}`);
    const mapsUrl = `https://maps.google.com/?q=${record.lat.toFixed(5)},${record.lng.toFixed(5)}`;
    lines.push(`**Map:** [Open in Google Maps](${mapsUrl})`);
  }
  lines.push(`**Recorded by:** ${username}`);
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
  | { ok: true }
  | { ok: false; reason: "not_configured" | "open_failed"; error?: unknown };

export function useObsidian() {
  const { settings } = useSettings();

  const saveToObsidian = async (
    record: MemoryRecord,
    username: string
  ): Promise<ObsidianResult> => {
    if (!settings.vaultName.trim()) {
      return { ok: false, reason: "not_configured" };
    }

    const content = formatMarkdown(record, username);
    const filename = sanitizeFilename(`${record.date}_${record.id.substring(0, 8)}`);
    const filePath = settings.folder
      ? `${settings.folder}/${filename}`
      : filename;

    // NOTE: We intentionally skip Linking.canOpenURL() here.
    // On Android, custom URI schemes (obsidian://) require a <queries> manifest entry
    // to return true from canOpenURL; without it the check always returns false even
    // when Obsidian is installed.  We call openURL directly and catch any error.
    const uri =
      `obsidian://actions-uri/note/create` +
      `?vault=${encodeURIComponent(settings.vaultName)}` +
      `&file=${encodeURIComponent(filePath)}` +
      `&content=${encodeURIComponent(content)}` +
      `&overwrite=false`;

    try {
      await Linking.openURL(uri);
      return { ok: true };
    } catch (err) {
      console.warn("[Obsidian] openURL failed:", err);
      return { ok: false, reason: "open_failed", error: err };
    }
  };

  return { saveToObsidian };
}
