/**
 * Pure-JS JPEG EXIF GPS extractor.
 *
 * Expo's Android EXIF parser returns GPSLatitude/GPSLongitude as 0 because it
 * cannot decode the DMS rational string format stored in the GPS sub-IFD.
 * This module reads the raw JPEG bytes directly and parses the EXIF APP1
 * segment itself, which correctly handles the RATIONAL (degrees/minutes/seconds)
 * format on all platforms.
 *
 * No native modules — works in Expo Go.
 */

import * as FileSystem from "expo-file-system";

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

// ─── Base64 → Uint8Array ─────────────────────────────────────────────────────

function base64ToUint8Array(b64: string): Uint8Array {
  // atob is available in Hermes / React Native
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── JPEG marker scan ────────────────────────────────────────────────────────

function extractJpegExifGps(
  buf: Uint8Array
): { lat: number; lng: number } | undefined {
  // Must start with FFD8 (JPEG SOI)
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;

  let pos = 2;
  while (pos + 3 < buf.length) {
    if (buf[pos] !== 0xff) return undefined; // lost sync

    const marker = buf[pos + 1];
    pos += 2;

    // Skip fill bytes
    if (marker === 0xff) {
      pos--;
      continue;
    }
    // Standalone markers (no payload length)
    if (marker === 0xd8 || marker === 0xd9) continue;
    // SOS — compressed data follows; stop
    if (marker === 0xda) break;

    if (pos + 1 >= buf.length) break;
    const segLen = (buf[pos] << 8) | buf[pos + 1]; // big-endian

    if (marker === 0xe1 && segLen > 8) {
      // APP1 — look for Exif\0\0 signature
      const hdr = pos + 2;
      if (
        buf[hdr] === 0x45 && // E
        buf[hdr + 1] === 0x78 && // x
        buf[hdr + 2] === 0x69 && // i
        buf[hdr + 3] === 0x66 && // f
        buf[hdr + 4] === 0x00 &&
        buf[hdr + 5] === 0x00
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
  // Byte order: "II" = little-endian, "MM" = big-endian
  const little =
    buf[tiffStart] === 0x49 && buf[tiffStart + 1] === 0x49; // "II"

  const r16 = (o: number): number =>
    little
      ? buf[tiffStart + o] | (buf[tiffStart + o + 1] << 8)
      : (buf[tiffStart + o] << 8) | buf[tiffStart + o + 1];

  const r32 = (o: number): number => {
    const a = buf[tiffStart + o];
    const b = buf[tiffStart + o + 1];
    const c = buf[tiffStart + o + 2];
    const d = buf[tiffStart + o + 3];
    return little
      ? (a | (b << 8) | (c << 16) | (d << 24)) >>> 0
      : ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  };

  // Magic number must be 42
  if (r16(2) !== 42) return undefined;

  const ifd0Offset = r32(4);

  // Walk IFD0 looking for GPS IFD pointer (tag 0x8825)
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

  // Walk GPS IFD
  if (gpsIfdOffset + 2 > buf.length - tiffStart) return undefined;
  const gpsCount = r16(gpsIfdOffset);

  let latRef = "N";
  let lngRef = "E";
  let lat: number | undefined;
  let lng: number | undefined;

  for (let i = 0; i < gpsCount; i++) {
    const entry = gpsIfdOffset + 2 + i * 12;
    if (entry + 12 > buf.length - tiffStart) break;

    const tag = r16(entry);
    const type = r16(entry + 2);
    const count = r32(entry + 4);

    if ((tag === 0x0001 || tag === 0x0003) && type === 2) {
      // ASCII ref: GPSLatitudeRef or GPSLongitudeRef
      // If count <= 4 the value is inline; otherwise it's an offset
      const valOffset =
        count <= 4 ? entry + 8 : r32(entry + 8);
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
      // DMS as three RATIONAL values (each 8 bytes = num/den uint32)
      const dataOffset = r32(entry + 8); // always offset, 24 bytes won't fit in 4
      const absOff = tiffStart + dataOffset;
      const dms = readRationals(buf, absOff, 3, little);
      const dec = dms[0] + dms[1] / 60 + dms[2] / 3600;
      if (tag === 0x0002) lat = dec;
      else lng = dec;
    }
  }

  if (lat === undefined || lng === undefined) return undefined;
  // Reject null-island — almost certainly a parse failure
  if (lat === 0 && lng === 0) return undefined;

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
