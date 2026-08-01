import { Router } from "express";

const router: Router = Router();

// ── GET /admin ─────────────────────────────────────────────────────────────
// Self-contained HTML admin page for generating unlock codes.
// Protected by the SESSION_SECRET entered in the browser — nothing is stored
// client-side beyond the current page session.
router.get("/admin", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Memory Records · Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f0f11;
      color: #e8e8ed;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1c1c1e;
      border: 1px solid #2c2c2e;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .logo { font-size: 28px; text-align: center; }
    h1 {
      font-size: 18px;
      font-weight: 700;
      text-align: center;
      color: #fff;
    }
    label {
      font-size: 12px;
      font-weight: 500;
      color: #8e8e93;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 6px;
    }
    input[type="password"] {
      width: 100%;
      background: #2c2c2e;
      border: 1px solid #3a3a3c;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 15px;
      color: #e8e8ed;
      outline: none;
    }
    input[type="password"]:focus { border-color: #6e56cf; }
    button {
      width: 100%;
      background: #6e56cf;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    button:disabled { opacity: 0.5; cursor: default; }
    .result {
      display: none;
      background: #2c2c2e;
      border: 1px solid #3a3a3c;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      gap: 8px;
      flex-direction: column;
    }
    .result.show { display: flex; }
    .result-label { font-size: 11px; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.5px; }
    .result-code {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #6e56cf;
      font-family: "SF Mono", "Fira Code", monospace;
      cursor: pointer;
      user-select: all;
    }
    .result-hint { font-size: 12px; color: #636366; }
    .error {
      display: none;
      background: #3a1a1a;
      border: 1px solid #5a2a2a;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: #ff6b6b;
      text-align: center;
    }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔐</div>
    <h1>Memory Records Admin</h1>

    <div>
      <label for="secret">Admin key (SESSION_SECRET)</label>
      <input type="password" id="secret" placeholder="Paste your SESSION_SECRET here" autocomplete="off" />
    </div>

    <button id="btn" onclick="generate()">Generate unlock code</button>

    <div class="result" id="result">
      <span class="result-label">One-time activation code</span>
      <span class="result-code" id="code" title="Tap to copy"></span>
      <span class="result-hint">Tap the code to copy · single-use</span>
    </div>

    <div class="error" id="error"></div>
  </div>

  <script>
    async function generate() {
      const secret = document.getElementById('secret').value.trim();
      const btn = document.getElementById('btn');
      const result = document.getElementById('result');
      const codeEl = document.getElementById('code');
      const errorEl = document.getElementById('error');

      result.classList.remove('show');
      errorEl.classList.remove('show');

      if (!secret) {
        errorEl.textContent = 'Paste your SESSION_SECRET first.';
        errorEl.classList.add('show');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Generating…';

      try {
        const res = await fetch('/api/unlock/admin/generate-code', {
          method: 'POST',
          headers: { 'X-Admin-Key': secret, 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Server error ' + res.status);

        codeEl.textContent = data.code;
        result.classList.add('show');

        codeEl.onclick = () => {
          navigator.clipboard?.writeText(data.code);
          codeEl.textContent = 'Copied!';
          setTimeout(() => { codeEl.textContent = data.code; }, 1500);
        };
      } catch (err) {
        errorEl.textContent = err.message === 'Unauthorized'
          ? 'Wrong admin key — check your SESSION_SECRET.'
          : err.message;
        errorEl.classList.add('show');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate unlock code';
      }
    }

    document.getElementById('secret').addEventListener('keydown', e => {
      if (e.key === 'Enter') generate();
    });
  </script>
</body>
</html>`);
});

export default router;
