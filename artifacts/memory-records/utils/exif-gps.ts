/**
 * Pure-JS JPEG EXIF GPS extractor.
 *
 * Android's image picker may copy the selected photo to a cache file with GPS
 * rationals stripped. Prefer the original MediaLibrary asset URI and retain
 * raw-EXIF and legacy path fallbacks for providers that do not expose it.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Read GPS coordinates from a local JPEG URI by parsing its raw EXIF bytes.
 * Returns undefined if the file has no GPS data or cannot be read.
 */
export async function readGpsFromJpeg(
  uri: string
): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as const,
    });
    const buf = base64ToUint8Array(b64);
    return extractJpegExifGps(buf);
  } catch {
    return undefined;
  }
}

/**
 * Try to locate the original (un-copied) file from common Android gallery
 * paths using the picker asset's fileName. Expo always copies the selected
 * image to its own cache and zeroes the GPS rational bytes in the process,
 * so we fall back to reading the source file directly when possible.
 */
export async function readGpsFromOriginalFile(
  fileName: string | null | undefined
): Promise<{ lat: number; lng: number } | undefined> {
  if (!fileName) return undefined;
  const dirs = [
    "/storage/emulated/0/DCIM/Camera/",
    "/storage/emulated/0/DCIM/",
    "/storage/emulated/0/Pictures/",
    "/storage/emulated/0/Pictures/Camera/",
    "/sdcard/DCIM/Camera/",
    "/sdcard/DCIM/",
  ];
  for (const dir of dirs) {
    try {
      const path = `file://${dir}${fileName}`;
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        const gps = await readGpsFromJpeg(path);
        if (gps) return gps;
      }
    } catch {
      // Permission denied or file not found — try next directory
    }
  }
  return undefined;
}

/**
 * Read the selected Android gallery item's location from MediaStore.
 *
 * The image picker returns a MediaStore ID for gallery-backed photos. Unlike
 * the picker cache URI, this reads metadata through the original library asset.
 * Android requires both photo access and ACCESS_MEDIA_LOCATION for this query.
 */
export async function readGpsFromGalleryAsset(
  assetId: string | null | undefined
): Promise<{ lat: number; lng: number } | undefined> {
  if (!assetId || Platform.OS !== "android") return undefined;

  const normalizedId = assetId.trim();

  try {
    // Expo SDK 57's old getAssetInfoAsync API lives on the /legacy entrypoint;
    // the package root now exposes the class-based API.
    const MediaLibrary = await import("expo-media-library");
    const LegacyMediaLibrary = await import("expo-media-library/legacy");
    let permission = await MediaLibrary.getPermissionsAsync(false, ["photo"]);
    if (!permission.granted) {
      permission = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
    }
    if (!permission.granted) return undefined;

    if (!normalizedId.startsWith("content://")) {
      try {
        const info = await LegacyMediaLibrary.getAssetInfoAsync(normalizedId);
        if (info.localUri) {
          const gps = await readGpsFromJpeg(info.localUri);
          if (isValidGps(gps)) return gps;
        }
      } catch {
        // Some picker providers do not expose a MediaLibrary asset info entry.
      }
    }

    // The native MediaStore API can still expose coordinates when its original
    // URI is not directly readable as a file by FileSystem.
    let assetUri = normalizedId.startsWith("content://") ? normalizedId : undefined;
    if (!assetUri) {
      try {
        assetUri = await LegacyMediaLibrary.getAssetContentUriAsync(normalizedId);
      } catch {
        if (/^\d+$/.test(normalizedId)) {
          assetUri = `content://media/external/images/media/${normalizedId}`;
        }
      }
    }
    if (!assetUri) return undefined;

    const location = await new MediaLibrary.Asset(assetUri).getLocation();
    if (!location) return undefined;

    const { latitude, longitude } = location;
    const gps = { lat: latitude, lng: longitude };
    return isValidGps(gps) ? gps : undefined;
  } catch (error) {
    console.warn("[GalleryGps] Could not read original photo location:", error);
    return undefined;
  }
}

function isValidGps(
  gps: { lat: number; lng: number } | undefined
): gps is { lat: number; lng: number } {
  return !!gps &&
    Number.isFinite(gps.lat) &&
    Number.isFinite(gps.lng) &&
    gps.lat >= -90 &&
    gps.lat <= 90 &&
    gps.lng >= -180 &&
    gps.lng <= 180 &&
    (gps.lat !== 0 || gps.lng !== 0);
}

// ─── Base64 → Uint8Array ─────────────────────────────────────────────────────

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── JPEG marker scan ────────────────────────────────────────────────────────

function extractJpegExifGps(
  buf: Uint8Array
): { lat: number; lng: number } | undefined {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;

  let pos = 2;
  while (pos + 3 < buf.length) {
    if (buf[pos] !== 0xff) return undefined;

    const marker = buf[pos + 1];
    pos += 2;

    if (marker === 0xff) { pos--; continue; }
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;

    if (pos + 1 >= buf.length) break;
    const segLen = (buf[pos] << 8) | buf[pos + 1];

    if (marker === 0xe1 && segLen > 8) {
      const hdr = pos + 2;
      if (
        buf[hdr] === 0x45 && buf[hdr + 1] === 0x78 &&
        buf[hdr + 2] === 0x69 && buf[hdr + 3] === 0x66 &&
        buf[hdr + 4] === 0x00 && buf[hdr + 5] === 0x00
      ) {
        return parseTiffGps(buf, hdr + 6);
      }
    }

    pos += segLen;
  }
  return undefined;
}

// ─── TIFF / IFD parser ───────────────────────────────────────────────────────

function parseTiffGps(
  buf: Uint8Array,
  tiffStart: number
): { lat: number; lng: number } | undefined {
  const little =
    buf[tiffStart] === 0x49 && buf[tiffStart + 1] === 0x49;

  const r16 = (o: number): number =>
    little
      ? buf[tiffStart + o] | (buf[tiffStart + o + 1] << 8)
      : (buf[tiffStart + o] << 8) | buf[tiffStart + o + 1];

  const r32 = (o: number): number => {
    const a = buf[tiffStart + o], b = buf[tiffStart + o + 1];
    const c = buf[tiffStart + o + 2], d = buf[tiffStart + o + 3];
    return (little
      ? (a | (b << 8) | (c << 16) | (d << 24))
      : ((a << 24) | (b << 16) | (c << 8) | d)) >>> 0;
  };

  if (r16(2) !== 42) return undefined;

  const ifd0Offset = r32(4);
  if (ifd0Offset + 2 > buf.length - tiffStart) return undefined;
  const ifd0Count = r16(ifd0Offset);

  let gpsIfdOffset: number | undefined;
  for (let i = 0; i < ifd0Count; i++) {
    const entry = ifd0Offset + 2 + i * 12;
    if (entry + 12 > buf.length - tiffStart) break;
    if (r16(entry) === 0x8825) {
      gpsIfdOffset = r32(entry + 8);
      break;
    }
  }
  if (gpsIfdOffset === undefined) return undefined;
  if (gpsIfdOffset + 2 > buf.length - tiffStart) return undefined;

  const gpsCount = r16(gpsIfdOffset);
  let latRef = "N", lngRef = "E";
  let lat: number | undefined, lng: number | undefined;

  for (let i = 0; i < gpsCount; i++) {
    const entry = gpsIfdOffset + 2 + i * 12;
    if (entry + 12 > buf.length - tiffStart) break;

    const tag = r16(entry);
    const type = r16(entry + 2);
    const count = r32(entry + 4);

    if ((tag === 0x0001 || tag === 0x0003) && type === 2) {
      // GPSLatitudeRef / GPSLongitudeRef — ASCII, usually inline (count ≤ 4)
      const valOffset = count <= 4 ? entry + 8 : r32(entry + 8);
      const absOff = tiffStart + valOffset;
      if (absOff < buf.length) {
        const ch = String.fromCharCode(buf[absOff]);
        if (tag === 0x0001) latRef = ch;
        else lngRef = ch;
      }
    } else if (
      (tag === 0x0002 || tag === 0x0004) &&
      type === 5 /* RATIONAL */ &&
      count === 3
    ) {
      // GPSLatitude / GPSLongitude — 3 × RATIONAL (deg/min/sec)
      const dataOffset = r32(entry + 8);
      const absOff = tiffStart + dataOffset;
      const dms = readRationals(buf, absOff, 3, little);
      // Only accept if we got real (non-zero) rational data
      if (dms[0] !== 0 || dms[1] !== 0 || dms[2] !== 0) {
        const dec = dms[0] + dms[1] / 60 + dms[2] / 3600;
        if (tag === 0x0002) lat = dec;
        else lng = dec;
      }
    }
  }

  if (lat === undefined || lng === undefined) return undefined;

  const finalLat = latRef.toUpperCase() === "S" ? -Math.abs(lat) : Math.abs(lat);
  const finalLng = lngRef.toUpperCase() === "W" ? -Math.abs(lng) : Math.abs(lng);
  return { lat: finalLat, lng: finalLng };
}

// ─── RATIONAL reader ─────────────────────────────────────────────────────────

function readRationals(
  buf: Uint8Array,
  start: number,
  count: number,
  little: boolean
): number[] {
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = start + i * 8;
    if (o + 8 > buf.length) { result.push(0); continue; }
    let num: number, den: number;
    if (little) {
      num = (buf[o] | (buf[o+1] << 8) | (buf[o+2] << 16) | (buf[o+3] << 24)) >>> 0;
      den = (buf[o+4] | (buf[o+5] << 8) | (buf[o+6] << 16) | (buf[o+7] << 24)) >>> 0;
    } else {
      num = ((buf[o] << 24) | (buf[o+1] << 16) | (buf[o+2] << 8) | buf[o+3]) >>> 0;
      den = ((buf[o+4] << 24) | (buf[o+5] << 16) | (buf[o+6] << 8) | buf[o+7]) >>> 0;
    }
    result.push(den !== 0 ? num / den : 0);
  }
  return result;
}
