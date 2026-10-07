// @ts-check
import { MemWal } from "@mysten-incubation/memwal";
import { WALRUS, file, readJson, writeJson } from "./config.js";

/**
 * @typedef {{text:string, at?:string, score?:number}} Memo
 * @typedef {Object} Memory
 * @property {string} kind
 * @property {(text:string)=>Promise<void>} remember                   store one fact on purpose
 * @property {(query:string, limit?:number)=>Promise<Memo[]>} recall   newest-first relevant memories
 * @property {(user:string, assistant:string)=>Promise<void>} rememberTurn  automatic end-of-turn memory
 */

const tokens = (/** @type {string} */ s) =>
  new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Zero-dependency fallback: a JSON file with token-overlap ranking. */
export class LocalMemory {
  kind = "local";
  /** @param {string} [path] */
  constructor(path = file("memory.json")) { this.path = path; }

  /** @returns {{text:string, at:string}[]} */
  #all() { return readJson(this.path, []); }

  async remember(/** @type {string} */ text) {
    const all = this.#all();
    all.push({ text: text.trim(), at: new Date().toISOString() });
    writeJson(this.path, all);
  }

  async recall(/** @type {string} */ query, limit = 5) {
    const q = tokens(query);
    return this.#all()
      .map((m) => {
        const t = tokens(m.text);
        let hit = 0;
        for (const w of q) if (t.has(w)) hit++;
        return { ...m, score: q.size ? hit / Math.sqrt(q.size * Math.max(t.size, 1)) : 0 };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  async rememberTurn(/** @type {string} */ user, /** @type {string} */ assistant) {
    if (user.trim().length < 12) return;
    await this.remember(`User: ${user.slice(0, 400)}\nAgent: ${assistant.slice(0, 300)}`);
  }
}

async function retrying(/** @type {()=>Promise<any>} */ fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const msg = String(/** @type {any} */ (e)?.message || e);
      const retryable = /429|5\d\d|fetch failed|ECONN|ETIMEDOUT|timeout/i.test(msg) && !/401|403/.test(msg);
      if (!retryable || i >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

/** Persistent memory on Walrus Memory (Sui), encrypted with Seal; delegate key only. */
export class WalrusMemory {
  kind = "walrus";
  /** @param {{accountId:string, delegateKey:string, serverUrl:string, namespace?:string}} o */
  constructor(o) {
    this.ns = o.namespace || "agent";
    this.mem = MemWal.create({ key: o.delegateKey, accountId: o.accountId, serverUrl: o.serverUrl, namespace: this.ns });
  }

  async remember(/** @type {string} */ text) {
    await retrying(() => this.mem.rememberAndWait(text, this.ns));
  }

  async recall(/** @type {string} */ query, limit = 5) {
    const r = await retrying(() => this.mem.recall({ query, limit, maxDistance: 0.8, sort: "recent", namespace: this.ns }));
    return r.results.map((m) => ({ text: m.text, at: m.created_at, score: 1 - m.distance }));
  }

  async rememberTurn(/** @type {string} */ user, /** @type {string} */ assistant) {
    if (user.trim().length < 12) return;
    const job = await retrying(() => this.mem.analyze(`User: ${user}\nAgent: ${assistant.slice(0, 1500)}`, this.ns));
    if (job.job_ids?.length) await retrying(() => this.mem.waitForRememberJobs(job.job_ids, [this.ns]));
  }
}

/** Walrus Memory when the agent was provisioned with it (agent init --walrus), otherwise the local file. */
export function selectMemory(/** @type {import("./config.js").Config} */ cfg) {
  const m = process.env.MEMWAL_ACCOUNT_ID && process.env.MEMWAL_KEY
    ? { provider: /** @type {const} */ ("walrus"), accountId: process.env.MEMWAL_ACCOUNT_ID, delegateKey: process.env.MEMWAL_KEY, serverUrl: process.env.MEMWAL_SERVER_URL, namespace: process.env.MEMWAL_NAMESPACE }
    : cfg.memory;
  if (m?.provider === "walrus" && m.accountId && m.delegateKey) {
    return new WalrusMemory({ ...m, serverUrl: m.serverUrl || WALRUS[cfg.network].relayer });
  }
  return new LocalMemory();
}
