#!/usr/bin/env node
import http from "node:http";
import { isIP } from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { URL } from "node:url";
import { promisify } from "node:util";

const HOST = "127.0.0.1";
const MODE = process.env.AGENT_OFFICE_MODE || "public";
if (!["public", "admin"].includes(MODE)) throw new Error("invalid_mode");
const IS_ADMIN = MODE === "admin";
const PORT = Number(process.env.AGENT_OFFICE_PORT || (IS_ADMIN ? 8789 : 8788));
const STATIC_ROOT = process.env.AGENT_OFFICE_STATIC_ROOT || path.resolve(import.meta.dirname, "../prototype");
const SNAPSHOT_FILE = process.env.AGENT_OFFICE_SNAPSHOT_FILE || "/var/lib/agent-office/public-state.json";
const AUTOMATION_DIR = process.env.OPENBOT_AUTOMATION_DIR || path.join(os.homedir(), ".config", "OpenBot", "automation");
const ALLOWED_ADMIN_EMAIL = process.env.AGENT_OFFICE_ADMIN_EMAIL || "";
const ALLOWED_ORIGIN = process.env.AGENT_OFFICE_ALLOWED_ORIGIN || "";
const ADMIN_AUTH = process.env.AGENT_OFFICE_ADMIN_AUTH || "access";
const LOCAL_LOGIN = ADMIN_AUTH === "password";
const PASSWORD_RECORD = /^scrypt:([0-9a-f]{32}):([0-9a-f]{64})$/.exec(process.env.AGENT_OFFICE_ADMIN_PASSWORD_HASH || "");
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
const derivePassword = promisify(crypto.scrypt);
const SESSION_COOKIE = "__Host-ao_session";
const SESSION_TTL = 8 * 60 * 60 * 1000;
const sessionHash = token => crypto.createHash("sha256").update(token).digest("hex");
const ACCESS_TEAM = process.env.AGENT_OFFICE_ACCESS_TEAM || "";
const ACCESS_AUDIENCE = process.env.AGENT_OFFICE_ACCESS_AUDIENCE || "";
const ACCESS_ISSUER = `https://${ACCESS_TEAM}.cloudflareaccess.com`;
const PRIVATE_CACHE = { "Cache-Control": "private, no-store" };
const VALID_DELIVERY = new Set(["queued", "starting", "running", "completed", "failed", "interrupted", "cancelled"]);
const RECEIPT_TTL = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024; // 16 KiB

// Strict versioned catalog (whitelist per ARQUITETURA-E-SEGURANCA.md)
const AGENT_CATALOG = [
  {
    slug: "whatsapp-orchestrator",
    displayName: "WhatsApp Orchestrator",
    roleTitle: "Triagem e roteamento",
    room: "Hub Central",
    safeActivityLabel: "Classificando uma solicitação",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Fast-Path",
  },
  {
    slug: "assistente-codex",
    displayName: "Assistente Codex",
    roleTitle: "Coordenação e engenharia local",
    room: "War Room Infra",
    safeActivityLabel: "Coordenando uma tarefa técnica",
    primaryModelFamily: "GPT",
    backupPoolsCount: 2,
    guardrailBadge: "Aprovação humana",
  },
  {
    slug: "cloud-ops",
    displayName: "Cloud Ops — Deploy & VPS",
    roleTitle: "Operação de infraestrutura",
    room: "War Room Infra",
    safeActivityLabel: "Preparando uma operação de infraestrutura",
    primaryModelFamily: null,
    backupPoolsCount: null,
    guardrailBadge: "Aprovação humana",
  },
  {
    slug: "devops-observabilidade",
    displayName: "DevOps — Observabilidade",
    roleTitle: "Observabilidade de nuvem",
    room: "War Room Infra",
    safeActivityLabel: "Verificando a saúde dos serviços",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Somente leitura",
  },
  {
    slug: "supabase-db",
    displayName: "Supabase & DB — Dados & RLS",
    roleTitle: "Segurança e desempenho de dados",
    room: "War Room Infra",
    safeActivityLabel: "Revisando políticas de acesso",
    primaryModelFamily: null,
    backupPoolsCount: null,
    guardrailBadge: "RLS",
  },
  {
    slug: "suporte-saude-bugs",
    displayName: "Suporte — Saúde e Bugs",
    roleTitle: "Diagnóstico operacional",
    room: "War Room Infra",
    safeActivityLabel: "Analisando filas e rotinas",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Somente leitura",
  },
  {
    slug: "nexus-pesquisa",
    displayName: "Nexus — Pesquisa Técnica",
    roleTitle: "Pesquisa de sistemas distribuídos",
    room: "Product Lab",
    safeActivityLabel: "Revisando evidências de arquitetura",
    primaryModelFamily: "GPT",
    backupPoolsCount: 2,
    guardrailBadge: "Workspace",
  },
  {
    slug: "viu-mercado-adocao",
    displayName: "Viu — Mercado e Adoção",
    roleTitle: "Estratégia e adoção de produto",
    room: "Product Lab",
    safeActivityLabel: "Avaliando hipóteses de adoção",
    primaryModelFamily: "GPT",
    backupPoolsCount: 2,
    guardrailBadge: "Workspace",
  },
  {
    slug: "pitch-design",
    displayName: "Pitch — Design & Slides",
    roleTitle: "Comunicação de engenharia",
    room: "Product Lab",
    safeActivityLabel: "Estruturando uma apresentação",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Revisão humana",
  },
  {
    slug: "curador-threads-links",
    displayName: "Curador — Threads & Links",
    roleTitle: "Curadoria técnica",
    room: "Product Lab",
    safeActivityLabel: "Conferindo referências técnicas",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Revisão humana",
  },
  {
    slug: "faculdade-suap",
    displayName: "Faculdade — SUAP",
    roleTitle: "Coleta acadêmica seletiva",
    room: "Personal Ops",
    safeActivityLabel: "Executando uma consulta acadêmica",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Vault",
  },
  {
    slug: "agenda-semana",
    displayName: "Agenda — Semana",
    roleTitle: "Sincronização de agenda",
    room: "Personal Ops",
    safeActivityLabel: "Consolidando uma janela de agenda",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Somente leitura",
  },
  {
    slug: "insights-diario",
    displayName: "Insights — Diário",
    roleTitle: "Indexação e deduplicação",
    room: "Personal Ops",
    safeActivityLabel: "Indexando registros",
    primaryModelFamily: "Gemini",
    backupPoolsCount: 2,
    guardrailBadge: "Deduplicação",
  },
];

const CATALOG_BY_SLUG = new Map(AGENT_CATALOG.map((a) => [a.slug, a]));
const VALID_STATUSES = new Set(["ready", "working", "queued", "waiting"]);
const VALID_RECENCY = new Set(["nas últimas horas", "hoje", "há mais tempo", null]);

// Slug -> OpenBot agentId mapping file (kept private on server, outside public assets)
const AGENT_MAP_FILE = process.env.AGENT_OFFICE_AGENT_MAP_FILE || "/etc/agent-office/agent-map.json";

const rateBuckets = new Map();
const pendingBindings = new Map();
const sessions = new Map();
let checkingPassword = false;
let receipts;
let expireReceipts;
if (IS_ADMIN) {
  const accessConfigured = /^[a-z0-9][a-z0-9-]*$/.test(ACCESS_TEAM) && ACCESS_AUDIENCE && ALLOWED_ADMIN_EMAIL;
  if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/.test(ALLOWED_ORIGIN) ||
      !(LOCAL_LOGIN ? PASSWORD_RECORD : ADMIN_AUTH === "access" && accessConfigured)) {
    throw new Error("admin_configuration_required");
  }
  const { DatabaseSync } = await import("node:sqlite");
  receipts = new DatabaseSync(process.env.AGENT_OFFICE_RECEIPTS_FILE || "/var/lib/agent-office-admin/receipts.sqlite");
  receipts.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY, operator TEXT NOT NULL, slug TEXT NOT NULL, agentId TEXT NOT NULL,
      hash TEXT NOT NULL, created INTEGER NOT NULL, deliveryId TEXT NOT NULL UNIQUE,
      upstreamId TEXT, status TEXT, position INTEGER
    );
    CREATE INDEX IF NOT EXISTS receipts_created ON receipts (created);
  `);
  expireReceipts = receipts.prepare("DELETE FROM receipts WHERE created <= ?");
  expireReceipts.run(Date.now() - RECEIPT_TTL);
}

const maintenance = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets) if (entry.resetAt <= now) rateBuckets.delete(key);
  for (const [key, entry] of pendingBindings) if (entry.expires <= now) pendingBindings.delete(key);
  for (const [key, session] of sessions) if (session.expires <= now) sessions.delete(key);
  try {
    expireReceipts?.run(now - RECEIPT_TTL);
  } catch {
    console.error(JSON.stringify({ event: "receipt_cleanup_failed" }));
  }
}, 60_000);
maintenance.unref();

function checkRateLimit(ip, bucketType, limit, windowMs) {
  const now = Date.now();
  const key = `${bucketType}:${ip}`;
  let entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    if (!entry && rateBuckets.size >= 4096) return { allowed: false, retryAfterSec: 60 };
    entry = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

function requestIp(req) {
  const peer = req.socket.remoteAddress;
  if (peer !== HOST) return peer;
  const forwarded = process.env.AGENT_OFFICE_TRUST_LOCAL_PROXY === "1" ? req.headers["x-office-client-ip"]
    : process.env.AGENT_OFFICE_TRUST_CF_IP === "1" ? req.headers["cf-connecting-ip"] : null;
  return typeof forwarded === "string" && isIP(forwarded) ? forwarded : peer;
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function passwordSession(req) {
  const cookies = (req.headers.cookie || "").split(";").map(part => part.trim())
    .filter(part => part.startsWith(SESSION_COOKIE + "="));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(SESSION_COOKIE.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const key = sessionHash(token);
  const session = sessions.get(key);
  return session && session.expires > Date.now() ? { ...session, key } : null;
}

async function login(req, res, ip) {
  if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", { Allow: "POST" });
  if (req.headers.origin !== ALLOWED_ORIGIN) return sendError(res, 403, "forbidden");
  const limit = checkRateLimit(ip, "login", 5, 15 * 60_000);
  if (!limit.allowed) return sendError(res, 429, "rate_limited", { "Retry-After": String(limit.retryAfterSec) });
  const body = await readJsonBody(req);
  if (Object.keys(body).length !== 1 || typeof body.password !== "string" ||
      !body.password || Buffer.byteLength(body.password) > 1024) return sendError(res, 400, "invalid_request");
  if (checkingPassword) return sendError(res, 429, "rate_limited", { "Retry-After": "1" });
  const total = checkRateLimit("all", "login_global", 20, 60_000);
  if (!total.allowed) return sendError(res, 429, "rate_limited", { "Retry-After": String(total.retryAfterSec) });
  checkingPassword = true;
  let matches;
  try {
    const key = await derivePassword(body.password, Buffer.from(PASSWORD_RECORD[1], "hex"), 32, SCRYPT_OPTIONS);
    matches = crypto.timingSafeEqual(key, Buffer.from(PASSWORD_RECORD[2], "hex"));
  } finally {
    checkingPassword = false;
  }
  if (!matches) return sendError(res, 401, "unauthorized");
  rateBuckets.delete(`login:${ip}`);
  const oldSession = passwordSession(req);
  if (oldSession) sessions.delete(oldSession.key);
  if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
  const token = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(32).toString("base64url");
  sessions.set(sessionHash(token), { operator: "local-owner", csrf, expires: Date.now() + SESSION_TTL });
  return sendJson(res, 200, { csrfToken: csrf }, { ...PRIVATE_CACHE, "Set-Cookie": sessionCookie(token, SESSION_TTL / 1000) });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...(IS_ADMIN ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    ...extraHeaders,
  });
  res.end(body);
}

function sendError(res, statusCode, code, extraHeaders = {}) {
  sendJson(res, statusCode, { error: { code } }, { "Cache-Control": IS_ADMIN ? "private, no-store" : "no-store", ...extraHeaders });
}

function sendPage(req, res, html, headers, publicFonts = false) {
  const scriptHashes = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g),
    ([, script]) => `'sha256-${crypto.createHash("sha256").update(script).digest("base64")}'`).join(" ");
  const fonts = publicFonts ? " https://fonts.googleapis.com; font-src https://fonts.gstatic.com" : "";
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    ...(IS_ADMIN ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    "Content-Security-Policy": `default-src 'none'; script-src ${scriptHashes || "'none'"}; style-src 'unsafe-inline'${fonts}; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    ...headers,
  });
  res.end(req.method === "HEAD" ? undefined : html);
}

function sanitizePublicStateFromSnapshot() {
  try {
    const { size, mtimeMs } = fs.statSync(SNAPSHOT_FILE);
    const ageMs = Date.now() - Math.floor(mtimeMs);
    if (ageMs < 0 || ageMs > 30 * 60_000 || size > 64 * 1024) return null;
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
    if (!Array.isArray(raw?.agents) || Object.keys(raw).length !== 1 || raw.agents.length !== AGENT_CATALOG.length) return null;
    const bySlug = new Map(raw.agents.map((item) => [item?.slug, item]));
    if (bySlug.size !== AGENT_CATALOG.length) return null;
    const agents = [];
    for (const cat of AGENT_CATALOG) {
      const snap = bySlug.get(cat.slug);
      if (!snap || Object.keys(snap).length !== 3 || !VALID_STATUSES.has(snap.status) ||
          !VALID_RECENCY.has(snap.lastActiveRelative)) return null;
      agents.push({
        ...cat,
        status: snap.status,
        safeActivityLabel: snap.status === "working" ? cat.safeActivityLabel : null,
        lastActiveRelative: snap.lastActiveRelative,
      });
    }
    return { agents };
  } catch {
    return null;
  }
}

function loadAutomationCredentials() {
  const baseUrl = fs.readFileSync(path.join(AUTOMATION_DIR, "url"), "utf8").trim();
  const token = fs.readFileSync(path.join(AUTOMATION_DIR, "token"), "utf8").trim();
  if (!/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(baseUrl) || !new URL(baseUrl).port || !token) {
    throw new Error("invalid_automation_configuration");
  }
  return { baseUrl, token };
}

function resolveAgentId(slug) {
  if (!CATALOG_BY_SLUG.has(slug)) return null;
  if (!fs.existsSync(AGENT_MAP_FILE)) return null;
  const map = JSON.parse(fs.readFileSync(AGENT_MAP_FILE, "utf8"));
  return typeof map[slug] === "string" ? map[slug] : null;
}

let accessKeys = new Map();
let keysExpireAt = 0;
let keyRefresh;
async function loadAccessKeys() {
  if (!keyRefresh) {
    keyRefresh = (async () => {
      const res = await fetch(`${ACCESS_ISSUER}/cdn-cgi/access/certs`, {
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error("access_keys_unavailable");
      const { keys } = await res.json();
      accessKeys = new Map(keys.filter((key) => key.kty === "RSA").map((key) => [key.kid, key]));
      keysExpireAt = Date.now() + 5 * 60_000;
    })().finally(() => { keyRefresh = undefined; });
  }
  await keyRefresh;
}

async function authenticateCommander(req) {
  const token = req.headers["cf-access-jwt-assertion"];
  if (typeof token !== "string" || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const [encodedHeader, encodedPayload, signature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url"));
    const claims = JSON.parse(Buffer.from(encodedPayload, "base64url"));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string" ||
        claims.iss !== ACCESS_ISSUER || !Array.isArray(claims.aud) || !claims.aud.includes(ACCESS_AUDIENCE) ||
        !Number.isInteger(claims.exp) || claims.exp <= now ||
        (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now)) ||
        claims.type !== "app" || claims.email !== ALLOWED_ADMIN_EMAIL ||
        typeof claims.sub !== "string" || !claims.sub) return null;
    if (Date.now() >= keysExpireAt) await loadAccessKeys();
    const jwk = accessKeys.get(header.kid);
    if (!jwk || !crypto.verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`),
      crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(signature, "base64url"))) return null;
    const csrf = crypto.createHash("sha256").update(token).digest("base64url");
    return { operator: claims.sub, csrf };
  } catch {
    return null;
  }
}

function redactSecrets(text) {
  if (typeof text !== "string") return null;
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_KEY]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|(?:AKIA|ASIA)[0-9A-Z]{16})\b/g, "[REDACTED_KEY]")
    .replace(/[^\s<>"'=@]+@(?:s\.whatsapp\.net|g\.us|lid)\b/gi, "[REDACTED_JID]")
    .replace(/(?<!\d)(?:\+[1-9]\d{7,14}|55\d{10,11})(?!\d)/g, "[REDACTED_PHONE]")
    .replace(/(?:\+55[ .-]?)?(?:\(\d{2}\)[ .-]?|\b\d{2}[ .-])\d{4,5}[ .-]\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/\/(?:Users|home|var\/lib\/openbot)\/[^\s"')]+/g, "[REDACTED_PATH]");
}

async function callOpenBot(method, apiPath, bodyObj = null) {
  const { baseUrl, token } = loadAutomationCredentials();
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(bodyObj ? { "Content-Type": "application/json" } : {}),
    },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function readJsonBody(req) {
  const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw { statusCode: 415, code: "unsupported_media_type" };
  const chunks = [];
  let total = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      req.resume();
      throw { statusCode: 413, code: "payload_too_large" };
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw { statusCode: 400, code: "invalid_request" };
  }
}

function normalizeQuestions(item) {
  if (item.requiresOpenBot !== false || !Array.isArray(item.questions) || !item.questions.length) return null;
  const questions = [];
  for (const q of item.questions) {
    if (!q || typeof q.id !== "string" || !q.id || q.isSecret || q.multiSelect ||
        (q.options === null && (q.id === "choice" || /(?:^|\n)\s*- /m.test(q.question))) ||
        typeof q.question !== "string" ||
        (q.options !== null && (!Array.isArray(q.options) || !q.options.length ||
          q.options.some((option) => typeof option?.label !== "string" || redactSecrets(option.label) !== option.label)))) return null;
    questions.push({
      id: q.id, header: redactSecrets(q.header), question: redactSecrets(q.question),
      options: q.options?.map(({ label, description }) => ({ label, description: redactSecrets(description) })) ?? null,
    });
  }
  return new Set(questions.map((q) => q.id)).size === questions.length ? questions : null;
}

async function readPending(agentId) {
  const upstream = await callOpenBot("GET", `/v1/agents/${encodeURIComponent(agentId)}/pending`);
  if (upstream.status !== 200) throw { statusCode: 503, code: "upstream_unavailable" };
  const { prompts, approvals, browserTakeovers } = upstream.json ?? {};
  return [[prompts, "question"], [approvals, "approval"], [browserTakeovers, "browser_takeover"]].flatMap(
    ([items, kind]) => {
      if (!Array.isArray(items) || items.some((item) => typeof item?.requestId !== "string")) {
        throw { statusCode: 502, code: "upstream_invalid" };
      }
      return items.map((item) => ({
        requestId: item.requestId, kind, questions: kind === "question" ? normalizeQuestions(item) : null,
      }));
    },
  );
}

// Clima de São Paulo para o céu do escritório. O servidor busca no Open-Meteo (sem chave)
// e guarda 10 min: o navegador do visitante nunca fala com terceiros.
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=-23.55&longitude=-46.63&current=temperature_2m,weather_code,is_day&timezone=America%2FSao_Paulo";
let weatherCache = { at: 0, value: null };
function weatherKind(code) {
  if ([95, 96, 99].includes(code)) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ([2, 3, 45, 48].includes(code) || (code >= 71 && code <= 77)) return "cloud";
  return "clear";
}
async function readWeather() {
  if (weatherCache.value && Date.now() - weatherCache.at < 10 * 60_000) return weatherCache.value;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(WEATHER_URL, { signal: ctl.signal });
    if (!r.ok) return weatherCache.value;
    const j = await r.json();
    const c = j?.current;
    if (!c || !Number.isFinite(c.temperature_2m) || !Number.isInteger(c.weather_code)) return weatherCache.value;
    weatherCache = { at: Date.now(), value: { kind: weatherKind(c.weather_code), temp: Math.round(c.temperature_2m * 10) / 10, isDay: c.is_day === 1 } };
    return weatherCache.value;
  } catch {
    return weatherCache.value;
  } finally { clearTimeout(t); }
}

function pathClass(pathname) {
  if (pathname === "/") return "frontend";
  if (pathname === "/healthz") return "health";
  if (pathname === "/api/public/state") return "public_state";
  if (pathname === "/api/public/weather") return "public_weather";
  if (pathname === "/api/admin/state" || pathname === "/api/admin/session") return "admin_state";
  if (pathname === "/api/admin/login") return "admin_login";
  if (pathname === "/api/admin/logout") return "admin_logout";
  if (pathname === "/admin") return "admin_page";
  const route = pathname.match(/^\/api\/admin\/agents\/[a-z0-9-]+\/(messages|deliveries|pending)(?:\/|$)/);
  return route?.[1] ?? "unknown";
}

const server = http.createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
  const startNs = process.hrtime.bigint();
  const clientIp = requestIp(req);
  let pathname = "";
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    pathname = url.pathname;
    // 1. Healthcheck endpoint for local systemd / observability
    if (url.pathname === "/healthz") {
      if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", { Allow: "GET" });
      return sendJson(res, 200, { ok: true }, { "Cache-Control": "no-store" });
    }

    // 2. Public Sanitized State API
    if (!IS_ADMIN && url.pathname === "/api/public/state") {
      if (req.method !== "GET") {
        return sendError(res, 405, "method_not_allowed", { Allow: "GET" });
      }
      if (url.search && url.search.length > 0) {
        return sendError(res, 400, "invalid_request");
      }
      const rl = checkRateLimit(clientIp, "public", 60, 60_000);
      if (!rl.allowed) {
        return sendError(res, 429, "rate_limited", { "Retry-After": String(rl.retryAfterSec) });
      }
      const state = sanitizePublicStateFromSnapshot();
      if (!state) {
        return sendError(res, 503, "state_unavailable");
      }
      return sendJson(res, 200, state, { "Cache-Control": "public, max-age=60" });
    }

    // 2b. Clima (público, sem dados pessoais)
    if (!IS_ADMIN && url.pathname === "/api/public/weather") {
      if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", { Allow: "GET" });
      if (url.search) return sendError(res, 400, "invalid_request");
      const rl = checkRateLimit(clientIp, "weather", 30, 60_000);
      if (!rl.allowed) return sendError(res, 429, "rate_limited", { "Retry-After": String(rl.retryAfterSec) });
      const w = await readWeather();
      if (!w) return sendError(res, 503, "weather_unavailable");
      return sendJson(res, 200, w, { "Cache-Control": "public, max-age=600" });
    }

    if (IS_ADMIN && (pathname === "/admin" || pathname.startsWith("/api/admin/"))) {
      if (url.search) return sendError(res, 400, "invalid_request");
      if (LOCAL_LOGIN && pathname === "/api/admin/login") return await login(req, res, clientIp);

      const auth = LOCAL_LOGIN ? passwordSession(req) : await authenticateCommander(req);
      if (!auth && !(LOCAL_LOGIN && pathname === "/admin")) return sendError(res, 401, "unauthorized");
      const rl = checkRateLimit(auth?.operator ?? clientIp, auth ? "admin" : "admin_page", 30, 60_000);
      if (!rl.allowed) return sendError(res, 429, "rate_limited", { "Retry-After": String(rl.retryAfterSec) });

      if (pathname === "/admin") {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return sendError(res, 405, "method_not_allowed", { Allow: "GET, HEAD" });
        }
        const catalog = AGENT_CATALOG.map(({ slug, displayName, room }) => ({ slug, displayName, room }));
        const catalogJson = JSON.stringify(catalog).replaceAll("<", "\\u003c");
        const html = fs.readFileSync(path.join(import.meta.dirname, "commander.html"), "utf8")
          .replace("/* AGENT_CATALOG */ []", () => catalogJson)
          .replace("/* PASSWORD_LOGIN */ false", String(LOCAL_LOGIN));
        return sendPage(req, res, html, PRIVATE_CACHE);
      }

      if (req.method === "POST" &&
          (req.headers.origin !== ALLOWED_ORIGIN || req.headers["x-agent-office-csrf"] !== auth.csrf)) {
        return sendError(res, 403, "forbidden");
      }

      if (LOCAL_LOGIN && pathname === "/api/admin/logout") {
        if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", { Allow: "POST" });
        sessions.delete(auth.key);
        return sendJson(res, 200, { ok: true }, { ...PRIVATE_CACHE, "Set-Cookie": sessionCookie("", 0) });
      }

      if (pathname === "/api/admin/session" || pathname === "/api/admin/state") {
        if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", { Allow: "GET" });
        const payload = pathname.endsWith("/session")
          ? { csrfToken: auth.csrf }
          : { agents: AGENT_CATALOG.map(({ slug }) => ({ slug, status: null })) };
        return sendJson(res, 200, payload, PRIVATE_CACHE);
      }

      // Match /api/admin/agents/:id/messages
      const msgMatch = url.pathname.match(/^\/api\/admin\/agents\/([a-z0-9-]+)\/messages$/);
      if (msgMatch) {
        if (req.method !== "POST") return sendError(res, 405, "method_not_allowed", { Allow: "POST" });
        const slug = msgMatch[1];
        const agentId = resolveAgentId(slug);
        if (!agentId) return sendError(res, 404, "not_found");

        const body = await readJsonBody(req);
        const keys = Object.keys(body);
        if (keys.length !== 2 || !keys.includes("text") || !keys.includes("clientMessageId")) {
          return sendError(res, 400, "invalid_request");
        }
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const clientMessageId = typeof body.clientMessageId === "string" ? body.clientMessageId : "";
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (text.length < 1 || text.length > 4000 || !uuidRegex.test(clientMessageId)) {
          return sendError(res, 400, "invalid_request");
        }

        const receiptId = crypto.createHash("sha256")
          .update(JSON.stringify([auth.operator, slug, clientMessageId.toLowerCase()])).digest("hex");
        const bodyHash = crypto.createHash("sha256").update(text).digest("hex");
        const deliveryId = `dlv_${crypto.randomBytes(16).toString("hex")}`;
        receipts.prepare(`
          INSERT INTO receipts (id, operator, slug, agentId, hash, created, deliveryId)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
        `).run(receiptId, auth.operator, slug, agentId, bodyHash, Date.now(), deliveryId);
        let binding = receipts.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId);
        if (binding.hash !== bodyHash || binding.created + RECEIPT_TTL <= Date.now() || binding.agentId !== agentId) {
          return sendError(res, 409, "conflict");
        }
        if (!binding.upstreamId) {
          const limits = checkRateLimit(`${auth.operator}:${slug}`, "dispatch", 10, 60 * 60_000);
          if (!limits.allowed) return sendError(res, 429, "rate_limited", { "Retry-After": String(limits.retryAfterSec) });
          const upstream = await callOpenBot("POST", `/v1/agents/${encodeURIComponent(agentId)}/messages`, {
            text, clientMessageId: receiptId,
          });
          if (upstream.status !== 202) return sendError(res, 503, "upstream_unavailable");
          const deliveries = upstream.json?.deliveries;
          const delivery = Array.isArray(deliveries) && deliveries.find((item) => item?.recipientAgentId === agentId);
          if (typeof delivery?.id !== "string" || !VALID_DELIVERY.has(delivery.status)) {
            return sendError(res, 502, "upstream_invalid");
          }
          const position = Number.isSafeInteger(delivery.position) && delivery.position > 0 ? delivery.position : null;
          receipts.prepare("UPDATE receipts SET upstreamId = ?, status = ?, position = ? WHERE id = ? AND upstreamId IS NULL")
            .run(delivery.id, delivery.status, position, receiptId);
          binding = receipts.prepare("SELECT * FROM receipts WHERE id = ?").get(receiptId);
        }
        return sendJson(res, 202, {
          deliveryId: binding.deliveryId, status: binding.status, position: binding.position,
        }, PRIVATE_CACHE);
      }

      // Match /api/admin/agents/:id/deliveries/:deliveryId
      const dlvMatch = url.pathname.match(/^\/api\/admin\/agents\/([a-z0-9-]+)\/deliveries\/(dlv_[a-f0-9]+)$/);
      if (dlvMatch) {
        if (req.method !== "GET") return sendError(res, 405, "method_not_allowed", { Allow: "GET" });
        const [, slug, opaqueDeliveryId] = dlvMatch;
        const binding = receipts.prepare("SELECT * FROM receipts WHERE deliveryId = ?").get(opaqueDeliveryId);
        if (!binding?.upstreamId || binding.created <= Date.now() - RECEIPT_TTL ||
            binding.operator !== auth.operator || binding.slug !== slug || resolveAgentId(slug) !== binding.agentId) {
          return sendError(res, 404, "not_found");
        }
        const upstream = await callOpenBot(
          "GET",
          `/v1/agents/${encodeURIComponent(binding.agentId)}/deliveries/${encodeURIComponent(binding.upstreamId)}`
        );
        if (upstream.status !== 200 || !upstream.json) {
          return sendError(res, 503, "upstream_unavailable");
        }
        const status = upstream.json.status;
        if (!VALID_DELIVERY.has(status)) return sendError(res, 502, "upstream_invalid");
        const errorMap = {
          failed: "delivery_failed",
          interrupted: "delivery_interrupted",
          cancelled: "delivery_cancelled",
        };
        return sendJson(
          res,
          200,
          {
            deliveryId: opaqueDeliveryId,
            status,
            answer: status === "completed" ? redactSecrets(upstream.json.answer || null) : null,
            error: errorMap[status] || null,
          },
          { "Cache-Control": "private, no-store" }
        );
      }

      const pendingMatch = pathname.match(/^\/api\/admin\/agents\/([a-z0-9-]+)\/pending(?:\/(pnd_[a-f0-9]+)\/answer)?$/);
      if (pendingMatch) {
        const [, slug, pendingId] = pendingMatch;
        const method = pendingId ? "POST" : "GET";
        if (req.method !== method) return sendError(res, 405, "method_not_allowed", { Allow: method });
        const agentId = resolveAgentId(slug);
        if (!agentId) return sendError(res, 404, "not_found");

        if (!pendingId) {
          const items = (await readPending(agentId)).map(({ requestId, kind, questions }) => {
            const reference = `pnd_${crypto.randomBytes(16).toString("hex")}`;
            pendingBindings.set(reference, { operator: auth.operator, agentId, slug, requestId, expires: Date.now() + 15 * 60_000 });
            return { pendingId: reference, kind, requiresOpenBot: !questions, questions: questions ?? [] };
          });
          return sendJson(res, 200, { items }, PRIVATE_CACHE);
        }

        const binding = pendingBindings.get(pendingId);
        if (!binding || binding.expires <= Date.now() || binding.operator !== auth.operator ||
            binding.slug !== slug || binding.agentId !== agentId) return sendError(res, 404, "not_found");
        const pending = (await readPending(agentId)).find((item) => item.requestId === binding.requestId);
        if (!pending) return sendError(res, 409, "conflict");
        if (pending.kind !== "question" || !pending.questions) return sendError(res, 403, "forbidden");
        const body = await readJsonBody(req);
        const { answers } = body;
        if (Object.keys(body).length !== 1 || !answers || typeof answers !== "object" || Array.isArray(answers) ||
            Object.keys(answers).length !== pending.questions.length) return sendError(res, 400, "invalid_request");
        for (const question of pending.questions) {
          const value = answers[question.id];
          if (!Object.hasOwn(answers, question.id) || !Array.isArray(value) || value.length !== 1 ||
              typeof value[0] !== "string" || !value[0].trim() || value[0].length > 1000 ||
              (question.options && !question.options.some(({ label }) => label === value[0]))) {
            return sendError(res, 400, "invalid_request");
          }
        }
        const upstream = await callOpenBot("POST",
          `/v1/agents/${encodeURIComponent(agentId)}/prompts/${encodeURIComponent(binding.requestId)}/answer`, { answers });
        if (upstream.status === 404 || upstream.status === 409) return sendError(res, 409, "conflict");
        if (upstream.status !== 200 || upstream.json?.ok !== true) return sendError(res, 503, "upstream_unavailable");
        pendingBindings.delete(pendingId);
        return sendJson(res, 200, { ok: true }, PRIVATE_CACHE);
      }

      return sendError(res, 404, "not_found");
    }

    if (!IS_ADMIN && ["/", "/index.html"].includes(pathname) && ["GET", "HEAD"].includes(req.method)) {
      const html = fs.readFileSync(path.join(STATIC_ROOT, "index.html"), "utf8");
      return sendPage(req, res, html, { "Cache-Control": "public, max-age=300" }, true);
    }

    return sendError(res, 404, "not_found");
  } catch (err) {
    if (err && typeof err.statusCode === "number" && err.code) {
      return sendError(res, err.statusCode, err.code);
    }
    return sendError(res, 503, "upstream_unavailable");
  } finally {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    // Structured metadata-only log (never logs bodies, tokens, prompts, or private headers)
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        method: ["GET", "HEAD", "POST"].includes(req.method) ? req.method : "OTHER",
        route: pathClass(pathname),
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      })
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ event: "agent_office_listening", host: HOST, port: server.address().port }));
});
