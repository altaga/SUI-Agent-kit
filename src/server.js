// @ts-check
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { file } from "./config.js";
import { createAgent } from "./agent.js";
import { LocalMemory, LayeredMemory } from "./memory.js";
import { suiClient } from "./x402.js";
import { requestTestnetSui } from "./faucet.js";
import { runResurrection } from "./demo.js";

const APPROVAL_TIMEOUT_MS = 120_000;
const MAX_SESSIONS = 20;
const MAX_LOG = 500;

function loadToken() {
  if (process.env.AGENT_WEB_TOKEN) return process.env.AGENT_WEB_TOKEN;
  const f = file("web-token");
  try { const t = fs.readFileSync(f, "utf8").trim(); if (t) return t; } catch {}
  const t = crypto.randomBytes(24).toString("base64url");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, t + "\n", { mode: 0o600 });
  return t;
}

const same = (/** @type {string} */ a, /** @type {string} */ b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * @typedef {"local"|"on-demand"|"sync"} Mode
 * @typedef {{id:string, name:string, mode:Mode, namespace:string, createdAt:string, busy:boolean, log:any[], memory:import("./memory.js").Memory, agent:any, sink:null|((e:any)=>void)}} Session
 */

/**
 * Local HTTP API for the agent. Listens on loopback only and requires a bearer token.
 * Sessions: each one is an independent agent conversation with its own, initially empty, local memory.
 * Walrus Memory stays reachable on demand (tools), or fully synced, depending on the session mode.
 * @param {Object} o
 * @param {import("./model.js").Model} o.model
 * @param {import("./memory.js").WalrusMemory|null} o.walrus
 * @param {import("./config.js").Config} o.cfg
 * @param {any} o.wallet
 * @param {string} o.cwd
 * @param {number} [o.port]
 */
export async function startServer(o) {
  const token = loadToken();
  const port = o.port ?? 8787;
  const host = "127.0.0.1";

  let demoBusy = false;
  /** @type {Map<string, Session>} */ const sessions = new Map();
  /** @type {Map<string, {session:string, resolve:(ok:boolean)=>void}>} */ const pending = new Map();

  function createSession(/** @type {{name?:string, mode?:string, namespace?:string}} */ b) {
    if (sessions.size >= MAX_SESSIONS) throw new Error("too many sessions");
    const id = crypto.randomBytes(4).toString("hex");
    const mode = /** @type {Mode} */ (["local", "on-demand", "sync"].includes(String(b.mode)) ? b.mode : o.walrus ? "on-demand" : "local");
    if (mode !== "local" && !o.walrus) throw new Error("Walrus Memory is not configured (run: agent init --walrus)");
    const walrus = o.walrus && mode !== "local" ? (b.namespace ? o.walrus.withNamespace(String(b.namespace).slice(0, 64)) : o.walrus) : null;
    const local = new LocalMemory(file(`sessions/${id}.json`));
    const memory = mode === "sync" && walrus ? new LayeredMemory(local, walrus) : local;
    /** @type {Session} */
    const s = { id, name: String(b.name || `Session ${sessions.size + 1}`).slice(0, 60), mode, namespace: walrus?.ns ?? "", createdAt: new Date().toISOString(), busy: false, log: [], memory, agent: null, sink: null };
    const approve = (/** @type {string} */ what) => new Promise((resolve) => {
      if (!s.sink) return resolve(false);
      const aid = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(aid); resolve(false); }, APPROVAL_TIMEOUT_MS);
      pending.set(aid, { session: id, resolve: (ok) => { clearTimeout(timer); pending.delete(aid); resolve(ok); } });
      s.sink({ type: "approval", id: aid, text: what });
    });
    s.agent = createAgent({ model: o.model, memory, walrus, cfg: o.cfg, wallet: o.wallet, cwd: o.cwd, approve, onEvent: (e) => s.sink?.(e) });
    sessions.set(id, s);
    return s;
  }
  const view = (/** @type {Session} */ s) => ({ id: s.id, name: s.name, mode: s.mode, namespace: s.namespace, createdAt: s.createdAt, busy: s.busy, messages: s.log.length });
  createSession({ name: "Session 1" });

  const json = (/** @type {http.ServerResponse} */ res, /** @type {number} */ code, /** @type {any} */ body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (/** @type {http.IncomingMessage} */ req) => new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (d) => { s += d; if (s.length > 1_000_000) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error("invalid JSON")); } });
    req.on("error", reject);
  });

  async function balances() {
    if (!o.wallet) return [];
    const { balances: b } = await suiClient(o.cfg.network).core.listBalances({ owner: o.wallet.address });
    return b.map((/** @type {any} */ x) => ({ coinType: x.coinType, balance: x.balance }));
  }
  const COINS = /** @type {const} */ ([["sui", "::sui::SUI", 9], ["wal", "::wal::WAL", 9], ["usdc", "::usdc::USDC", 6]]);
  async function summary() {
    /** @type {Record<string, string>} */
    const out = { sui: "0", wal: "0", usdc: "0" };
    for (const b of await balances()) {
      const c = COINS.find(([, suffix]) => b.coinType.endsWith(suffix));
      if (!c) continue;
      const v = BigInt(b.balance), d = 10n ** BigInt(c[2]);
      const frac = (v % d).toString().padStart(c[2], "0").slice(0, c[0] === "usdc" ? 2 : 4);
      out[c[0]] = `${v / d}.${frac}`;
    }
    return { network: o.cfg.network, address: o.wallet?.address ?? null, ...out };
  }
  const need = (/** @type {Session|undefined} */ s) => { if (!s) throw Object.assign(new Error("unknown session"), { code: 404 }); return s; };
  const needWalrus = () => { if (!o.walrus) throw new Error("Walrus Memory is not configured"); return o.walrus; };

  /** @type {Record<string, {label:string, description:string, input?:string, available:boolean, run:(arg:string, s:Session)=>Promise<any>}>} */
  const actions = {
    wallet: { label: "Wallet", description: "Address and balances", available: true, run: async () => ({ address: o.wallet?.address ?? null, network: o.cfg.network, balances: await balances() }) },
    recall: { label: "Recall (session)", description: "Search this session's memory", input: "query", available: true, run: async (q, s) => ({ source: s.memory.kind, memories: await s.memory.recall(q, 10) }) },
    remember: { label: "Remember (session)", description: "Store a note in this session's memory", input: "text", available: true, run: async (t, s) => { await s.memory.remember(t); return { ok: true }; } },
    walrus_recall: { label: "Search Walrus", description: "Query long-term memory on Walrus on demand", input: "query", available: !!o.walrus, run: async (q) => ({ source: "walrus", memories: await needWalrus().recall(q, 10) }) },
    walrus_pull: { label: "Pull from Walrus", description: "Copy matching Walrus memories into this session", input: "query", available: !!o.walrus, run: async (q, s) => { const m = await needWalrus().recall(q, 10); for (const x of m) await s.memory.remember(x.text); return { source: "walrus", copied: m.length, memories: m }; } },
    walrus_remember: { label: "Save to Walrus", description: "Store a note permanently on Walrus", input: "text", available: !!o.walrus, run: async (t) => { await needWalrus().remember(t); return { ok: true }; } },
    faucet: { label: "Testnet SUI", description: "Request 1 SUI from the testnet faucet", available: o.cfg.network === "testnet" && !!o.wallet, run: async () => { const logs = []; await requestTestnetSui(o.wallet.address, (/** @type {string} */ m) => logs.push(m)); return { ok: true, logs, balances: await balances() }; } },
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://x");
    // Only the SUIde server (same machine) calls this API: no CORS, so no browser page can reach it.
    if (!url.pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });

    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ") || !same(auth.slice(7), token)) return json(res, 401, { error: "unauthorized" });

    try {
      const p = url.pathname;
      if (req.method === "GET" && p === "/api/status") {
        return json(res, 200, { provider: o.model.provider, model: o.model.id, walrus: !!o.walrus, demo: !!o.walrus && !!o.wallet && o.cfg.network === "testnet", network: o.cfg.network, address: o.wallet?.address ?? null, approval: o.cfg.approval, cwd: o.cwd });
      }
      if (req.method === "GET" && p === "/api/balance") return json(res, 200, await summary());
      if (req.method === "GET" && p === "/api/actions") {
        return json(res, 200, Object.entries(actions).filter(([, a]) => a.available).map(([name, a]) => ({ name, label: a.label, description: a.description, input: a.input })));
      }
      if (req.method === "GET" && p === "/api/sessions") return json(res, 200, [...sessions.values()].map(view));
      if (req.method === "POST" && p === "/api/sessions") return json(res, 200, view(createSession(/** @type {any} */ (await readBody(req)))));
      let m = p.match(/^\/api\/sessions\/([0-9a-f]{8})$/);
      if (m && req.method === "GET") { const s = need(sessions.get(m[1])); return json(res, 200, { ...view(s), log: s.log }); }
      if (m && req.method === "DELETE") {
        const s = need(sessions.get(m[1]));
        if (s.busy) return json(res, 409, { error: "session is busy" });
        sessions.delete(s.id);
        fs.rmSync(file(`sessions/${s.id}.json`), { force: true });
        if (!sessions.size) createSession({ name: "Session 1" });
        return json(res, 200, { ok: true });
      }
      m = p.match(/^\/api\/action\/([a-z_]+)$/);
      if (m && req.method === "POST") {
        const a = actions[m[1]];
        if (!a || !a.available) return json(res, 404, { error: "unknown action" });
        const b = /** @type {any} */ (await readBody(req));
        const arg = String(b.input || "").trim();
        if (a.input && !arg) return json(res, 400, { error: `${a.input} required` });
        return json(res, 200, await a.run(arg, need(sessions.get(String(b.session || [...sessions.keys()][0])))));
      }
      if (req.method === "POST" && p === "/api/approve") {
        const b = /** @type {any} */ (await readBody(req));
        const a = pending.get(String(b.id));
        if (!a) return json(res, 404, { error: "no such pending approval" });
        a.resolve(b.allow === true);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && p === "/api/demo/resurrection") {
        if (demoBusy) return json(res, 409, { error: "a demo is already running" });
        if (o.cfg.network !== "testnet" || !o.walrus || !o.wallet) return json(res, 400, { error: "The demo needs testnet, a wallet and Walrus Memory." });
        demoBusy = true;
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.flushHeaders();
        const send = (/** @type {any} */ e) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`); };
        const ac = new AbortController();
        res.on("close", () => ac.abort());
        try { await runResurrection({ cfg: o.cfg, wallet: o.wallet, walrus: o.walrus, emit: send, signal: ac.signal }); send({ type: "done", text: "" }); }
        catch (e) { send({ type: "error", text: /** @type {any} */ (e).message }); }
        finally { demoBusy = false; res.end(); }
        return;
      }
      if (req.method === "POST" && p === "/api/chat") {
        const b = /** @type {any} */ (await readBody(req));
        const s = need(sessions.get(String(b.session)));
        const message = String(b.message || "").trim();
        if (!message) return json(res, 400, { error: "message required" });
        if (s.busy) return json(res, 409, { error: "session is busy" });
        s.busy = true;
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.flushHeaders();
        const keep = (/** @type {any} */ e) => { if (e.type !== "approval") { s.log.push(e); if (s.log.length > MAX_LOG) s.log.shift(); } };
        const send = (/** @type {any} */ e) => { keep(e); if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`); };
        s.sink = send;
        keep({ type: "user", text: message });
        if (/^Session \d+$/.test(s.name)) s.name = message.replace(/\s+/g, " ").slice(0, 40);
        res.on("close", () => { for (const [id, a] of pending) if (a.session === s.id) a.resolve(false); });
        try {
          send({ type: "done", text: await s.agent.run(message) });
        } catch (e) {
          send({ type: "error", text: /** @type {any} */ (e).message });
        } finally {
          s.sink = null; s.busy = false; res.end();
        }
        return;
      }
      return json(res, 404, { error: "not found" });
    } catch (e) {
      return json(res, /** @type {any} */ (e).code === 404 ? 404 : 500, { error: /** @type {any} */ (e).message });
    }
  });

  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => resolve(undefined)); });
  return { server, token, port: /** @type {any} */ (server.address()).port, host, sessions, close: () => new Promise((r) => { server.close(() => r(undefined)); server.closeAllConnections(); }) };
}
