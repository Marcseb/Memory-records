import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router: Router = Router();

/** Create tables on startup — safe to call every time (IF NOT EXISTS). */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mr_unlock_devices (
      device_token  TEXT PRIMARY KEY,
      unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source        TEXT NOT NULL DEFAULT 'paypal',
      paypal_txn_id TEXT
    );
    CREATE TABLE IF NOT EXISTS mr_unlock_codes (
      code            TEXT PRIMARY KEY,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at         TIMESTAMPTZ,
      used_by_device  TEXT
    );
  `);
}
ensureTables().catch((e) =>
  logger.error({ err: e }, "Failed to ensure unlock tables"),
);

// ── GET /api/unlock/status/:deviceToken ────────────────────────────────────
router.get("/unlock/status/:deviceToken", async (req, res) => {
  const { deviceToken } = req.params;
  if (!deviceToken?.trim())
    return res.status(400).json({ error: "Missing deviceToken" });

  try {
    const { rows } = await pool.query(
      "SELECT unlocked_at FROM mr_unlock_devices WHERE device_token = $1",
      [deviceToken],
    );
    return res.json({ unlocked: rows.length > 0 });
  } catch (err) {
    logger.error({ err }, "unlock/status query error");
    return res.status(500).json({ error: "DB error" });
  }
});

// ── POST /api/unlock/paypal-ipn — PayPal IPN handler ──────────────────────
//
// PayPal requires a fast 200 response; we acknowledge first, then verify.
router.post("/unlock/paypal-ipn", async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately

  const body = req.body as Record<string, string>;

  // Build the verification body PayPal expects
  const verifyBody =
    "cmd=_notify-validate&" +
    Object.entries(body)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`,
      )
      .join("&");

  try {
    const verification = await fetch(
      "https://ipnpb.paypal.com/cgi-bin/webscr",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: verifyBody,
      },
    );
    const verifyText = (await verification.text()).trim();

    if (verifyText !== "VERIFIED") {
      logger.warn({ verifyText }, "PayPal IPN not VERIFIED — discarding");
      return;
    }

    const paymentStatus = body["payment_status"];
    const gross = parseFloat(body["mc_gross"] ?? "0");
    const currency = (body["mc_currency"] ?? "").toUpperCase();
    const deviceToken = (body["custom"] ?? "").trim();
    const txnId = body["txn_id"];

    if (paymentStatus !== "Completed") {
      logger.info({ paymentStatus }, "IPN received but payment not completed");
      return;
    }

    // Accept EUR ≥ 5 or USD ≥ 5.50 (rough €5 equivalent)
    const eligible =
      (currency === "EUR" && gross >= 5.0) ||
      (currency === "USD" && gross >= 5.5);
    if (!eligible) {
      logger.warn({ gross, currency }, "IPN payment amount/currency not eligible");
      return;
    }

    if (!deviceToken) {
      logger.warn({ txnId }, "IPN has no device token in custom field");
      return;
    }

    await pool.query(
      `INSERT INTO mr_unlock_devices (device_token, source, paypal_txn_id)
       VALUES ($1, 'paypal', $2)
       ON CONFLICT (device_token) DO NOTHING`,
      [deviceToken, txnId],
    );
    logger.info({ deviceToken, txnId }, "Device unlocked via PayPal IPN ✓");
  } catch (err) {
    logger.error({ err }, "PayPal IPN processing failed");
  }
});

// ── POST /api/unlock/code — activate with a one-time manual code ───────────
router.post("/unlock/code", async (req, res) => {
  const { code, deviceToken } = req.body as {
    code?: string;
    deviceToken?: string;
  };
  if (!code?.trim() || !deviceToken?.trim())
    return res.status(400).json({ error: "Missing code or deviceToken" });

  const normalised = code.trim().toUpperCase();

  try {
    const { rows } = await pool.query(
      "SELECT used_at, used_by_device FROM mr_unlock_codes WHERE code = $1",
      [normalised],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Invalid activation code" });

    const row = rows[0] as { used_at: Date | null; used_by_device: string | null };
    if (row.used_at && row.used_by_device !== deviceToken)
      return res.status(409).json({ error: "Code already used by another device" });

    // Mark used (idempotent for same device)
    await pool.query(
      `UPDATE mr_unlock_codes
          SET used_at = NOW(), used_by_device = $1
        WHERE code = $2`,
      [deviceToken, normalised],
    );

    // Unlock the device
    await pool.query(
      `INSERT INTO mr_unlock_devices (device_token, source)
       VALUES ($1, 'manual_code')
       ON CONFLICT (device_token) DO NOTHING`,
      [deviceToken],
    );

    logger.info({ deviceToken, normalised }, "Device unlocked via manual code ✓");
    return res.json({ unlocked: true });
  } catch (err) {
    logger.error({ err }, "unlock/code error");
    return res.status(500).json({ error: "DB error" });
  }
});

// ── POST /api/unlock/admin/generate-code — protected admin endpoint ────────
//
// Protected by SESSION_SECRET header. Call this after verifying a PayPal
// payment manually to generate a one-time code to send to the user.
//
//   curl -X POST https://…/api/unlock/admin/generate-code \
//        -H "X-Admin-Key: YOUR_SESSION_SECRET"
//
router.post("/unlock/admin/generate-code", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  const secret = process.env["SESSION_SECRET"];

  if (!secret || adminKey !== secret)
    return res.status(401).json({ error: "Unauthorized" });

  const code = "MR-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  try {
    await pool.query("INSERT INTO mr_unlock_codes (code) VALUES ($1)", [code]);
    logger.info({ code }, "Admin generated unlock code");
    return res.json({ code });
  } catch (err) {
    logger.error({ err }, "admin/generate-code error");
    return res.status(500).json({ error: "DB error" });
  }
});

export default router;
