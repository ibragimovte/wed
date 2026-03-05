import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const BACKUP_DIR = path.join(ROOT_DIR, "backup");

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN ?? "";
const TG_CHAT_ID = process.env.TG_CHAT_ID ?? "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";
const HASH_SALT = process.env.HASH_SALT ?? "change-me-in-prod";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const CSV_HEADER = [
  "id",
  "createdAt",
  "ipHash",
  "ua",
  "name",
  "attendance",
  "hot",
];

const RATE_LIMIT = {
  intervalMs: 10 * 60 * 1000,
  capacity: 13, // 10 regular + burst 3
  refillPerMs: 13 / (10 * 60 * 1000),
};

const buckets = new Map();
const app = express();

app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(
  helmet({
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: false,
  }),
);
app.use(express.json({ limit: "20kb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();

  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ ok: false, error: "forbidden_origin" });
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/admin", (_req, res) => {
  res.redirect("/admin/");
});

app.get("/admin/", (_req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});



app.post("/api/rsvp", async (req, res) => {
  try {
    const rate = applyRateLimit(getClientIp(req));
    if (!rate.allowed) {
      audit("rate_limited", { ip: getClientIp(req) });
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }

    const parsed = validatePayload(req.body);
    if (!parsed.ok) {
      audit("validation_error", { reason: parsed.reason });
      return res.status(400).json({ ok: false, error: "validation_error" });
    }

    const turnstileToken = String(req.body?.turnstileToken ?? "").trim();
    if (TURNSTILE_SECRET_KEY) {
      const valid = await verifyTurnstile(turnstileToken, getClientIp(req));
      if (!valid) {
        audit("turnstile_failed", {});
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
    }

    await ensureDirs();

    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ipHash: hashIp(getClientIp(req)),
      ua: sanitizeUa(req.headers["user-agent"]),
      ...parsed.data,
    };

    await appendRecord(record);
    await appendBackup(record);

    const tgResult = await sendTelegram(record);
    audit("rsvp_saved", { id: record.id, telegram: tgResult });

    return res.status(200).json({ ok: true, id: record.id });
  } catch (err) {
    audit("server_error", { message: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/admin/export.csv", adminAuth, async (_req, res) => {
  try {
    await ensureDirs();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"rsvp.csv\"");
    res.write(`${CSV_HEADER.join(",")}\n`);

    for await (const record of iterateRecords()) {
      const row = CSV_HEADER.map((key) => safeCsvField(record[key] ?? ""));
      res.write(`${row.join(",")}\n`);
    }
    return res.end();
  } catch (err) {
    audit("export_csv_failed", { message: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/admin/export.jsonl", adminAuth, async (_req, res) => {
  try {
    await ensureDirs();
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"rsvp.jsonl\"");

    for await (const record of iterateRecords()) {
      res.write(`${JSON.stringify(record)}\n`);
    }
    return res.end();
  } catch (err) {
    audit("export_jsonl_failed", { message: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.listen(PORT, () => {
  audit("server_started", { port: PORT });
});

function sanitizeText(value, maxLen) {
  const str = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return str.slice(0, maxLen);
}

function sanitizeUa(value) {
  return sanitizeText(value ?? "", 200);
}

function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "body_not_object" };
  }

  const allowed = new Set(["name", "attendance", "hot", "turnstileToken"]);
  const keys = Object.keys(body);
  for (const key of keys) {
    if (!allowed.has(key)) return { ok: false, reason: "unknown_field" };
  }

  const name = sanitizeText(body.name, 120);
  const attendance = sanitizeText(body.attendance, 12);
  const hot = sanitizeText(body.hot, 60);

  if (!name) return { ok: false, reason: "name_required" };
  if (!["yes", "no", "maybe"].includes(attendance)) {
    return { ok: false, reason: "attendance_invalid" };
  }
  if (attendance === "yes" && !hot) return { ok: false, reason: "hot_required" };

  return {
    ok: true,
    data: {
      name,
      attendance,
      hot: attendance === "yes" ? hot : "",
    },
  };
}

function getClientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || "";
  return String(raw).slice(0, 128);
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(`${HASH_SALT}:${ip}`).digest("hex");
}

function applyRateLimit(ip) {
  const now = Date.now();
  const item = buckets.get(ip) ?? { tokens: RATE_LIMIT.capacity, ts: now };
  const delta = Math.max(0, now - item.ts);
  const refill = delta * RATE_LIMIT.refillPerMs;
  item.tokens = Math.min(RATE_LIMIT.capacity, item.tokens + refill);
  item.ts = now;

  if (item.tokens < 1) {
    buckets.set(ip, item);
    return { allowed: false };
  }

  item.tokens -= 1;
  buckets.set(ip, item);
  return { allowed: true };
}

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function jsonlPathForDay(stamp) {
  return path.join(DATA_DIR, `rsvp-${stamp}.jsonl`);
}

function csvPathForDay(stamp) {
  return path.join(DATA_DIR, `rsvp-${stamp}.csv`);
}

function backupPathForDay(stamp) {
  return path.join(BACKUP_DIR, `rsvp-${stamp}.jsonl`);
}

async function ensureDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

async function appendRecord(record) {
  const stamp = todayStamp(new Date(record.createdAt));
  const jsonlLine = `${JSON.stringify(record)}\n`;
  await fsp.appendFile(jsonlPathForDay(stamp), jsonlLine, "utf8");

  const csvFile = csvPathForDay(stamp);
  const csvExists = fs.existsSync(csvFile);
  if (!csvExists) {
    await fsp.appendFile(csvFile, `${CSV_HEADER.join(",")}\n`, "utf8");
  }
  const csvRow = CSV_HEADER.map((key) => safeCsvField(record[key] ?? "")).join(",");
  await fsp.appendFile(csvFile, `${csvRow}\n`, "utf8");
}

async function appendBackup(record) {
  const stamp = todayStamp(new Date(record.createdAt));
  const line = `${JSON.stringify(record)}\n`;
  await fsp.appendFile(backupPathForDay(stamp), line, "utf8");
}

async function* iterateRecords() {
  const names = await fsp.readdir(DATA_DIR).catch(() => []);
  const files = names
    .filter((name) => /^rsvp-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort();

  for (const name of files) {
    const full = path.join(DATA_DIR, name);
    const text = await fsp.readFile(full, "utf8");
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line);
      } catch {
        audit("jsonl_parse_error", { file: name });
      }
    }
  }
}

function safeCsvField(value) {
  let str = String(value ?? "");
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  str = str.replace(/"/g, "\"\"");
  return `"${str}"`;
}

async function sendTelegram(record) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return "skipped_not_configured";

  const attendanceLabel =
    record.attendance === "yes"
      ? "✅ Да, будет"
      : record.attendance === "no"
        ? "❌ К сожалению, нет"
        : "❔ Дам точный ответ до 1 мая";

const hotLabel =
  record.hot === "meat" ? "Мясо" :
  record.hot === "fish" ? "Рыба" :
  (record.hot || "—");

const message = [
  "💌 Новая анкета гостей",
  "",
  `👤 Имя: ${record.name}`,
  `👥 Присутствие: ${attendanceLabel}`,
  `🍽 Горячее: ${hotLabel}`,
  "",
  `🕒 Время: ${record.createdAt}`,
].join("\n");


  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: message,
      }),
    });
    if (!response.ok) {
      audit("telegram_error", { code: response.status });
      return `failed_${response.status}`;
    }
    return "sent";
  } catch (err) {
    audit("telegram_error", { message: err instanceof Error ? err.message : String(err) });
    return "failed_network";
  }
}

async function verifyTurnstile(token, remoteIp) {
  if (!token) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: remoteIp,
      }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

function adminAuth(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ ok: false, error: "admin_not_configured" });
  }

  if (ADMIN_IP_ALLOWLIST.length > 0) {
    const ip = getClientIp(req);
    if (!ADMIN_IP_ALLOWLIST.includes(ip)) {
      return res.status(403).json({ ok: false, error: "forbidden_ip" });
    }
  }

  const auth = req.headers.authorization ?? "";
  const expected = `Bearer ${ADMIN_TOKEN}`;
  if (auth !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

function audit(event, data) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...data,
  };
  // Single-line structured logs for logrotate/grep.
  console.log(JSON.stringify(payload));
}
