// @ts-check
import os from "node:os";
import { tools as defaultTools } from "./tools.js";

const BASE_PROMPT = `You are an autonomous agent running on the user's own machine, with persistent long-term memory, coding tools (bash, files), web access and a Sui wallet to buy x402-priced services.
Work step by step, use tools instead of guessing, and keep answers short. Before spending money say what and why; stay inside the configured budget.
Memories from earlier sessions may appear below: treat the newest as authoritative when they conflict.`;

/**
 * @param {Object} o
 * @param {import("./model.js").Model} o.model
 * @param {import("./memory.js").Memory} o.memory
 * @param {import("./config.js").Config} o.cfg
 * @param {any} o.wallet
 * @param {string} [o.cwd]
 * @param {(what:string)=>Promise<boolean>} [o.approve]
 * @param {(e:{type:"text"|"tool"|"result"|"memory", text:string})=>void} [o.onEvent]
 * @param {import("./tools.js").Tool[]} [o.tools]
 * @param {string} [o.system]   extra system prompt
 * @param {number} [o.maxSteps]
 */
export function createAgent(o) {
  const cwd = o.cwd || process.cwd();
  const toolset = o.tools || defaultTools;
  const emit = o.onEvent || (() => {});
  const approve = async (/** @type {string} */ what) => (o.cfg.approval === "auto" ? true : (o.approve ? o.approve(what) : false));
  /** @type {any[]} */
  const messages = [];

  /** Run one user turn: recall -> think/act loop -> remember. Returns the final text. */
  async function run(/** @type {string} */ input) {
    let recalled = [];
    try { recalled = await o.memory.recall(input, 5); } catch (e) { emit({ type: "memory", text: `recall failed: ${/** @type {any} */ (e).message}` }); }
    if (recalled.length) emit({ type: "memory", text: `recalled ${recalled.length} memories` });
    const system = [
      BASE_PROMPT,
      o.system || "",
      `Date: ${new Date().toISOString()} | OS: ${process.platform}/${os.arch()} | cwd: ${cwd} | Sui ${o.cfg.network} wallet: ${o.wallet?.address ?? "none"}`,
      recalled.length ? `Relevant memories (newest first):\n${recalled.map((m) => `- ${m.at ? `[${m.at.slice(0, 10)}] ` : ""}${m.text}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    messages.push({ role: "user", content: input });
    const ctx = { cwd, cfg: o.cfg, memory: o.memory, wallet: o.wallet, approve };
    const specs = toolset.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
    let final = "";

    for (let step = 0; step < (o.maxSteps || 25); step++) {
      const res = await o.model.create({ max_tokens: 4096, system, tools: specs, messages });
      messages.push({ role: "assistant", content: res.content });
      const text = res.content.filter((/** @type {any} */ b) => b.type === "text").map((/** @type {any} */ b) => b.text).join("\n");
      if (text) { emit({ type: "text", text }); final = text; }
      const calls = res.content.filter((/** @type {any} */ b) => b.type === "tool_use");
      if (!calls.length) break;
      const results = [];
      for (const c of calls) {
        emit({ type: "tool", text: `${c.name} ${JSON.stringify(c.input).slice(0, 200)}` });
        let out;
        try {
          const t = toolset.find((x) => x.name === c.name);
          out = t ? await t.run(c.input, ctx) : `Unknown tool ${c.name}`;
        } catch (e) { out = `Error: ${/** @type {any} */ (e).message}`; }
        emit({ type: "result", text: String(out).slice(0, 300) });
        results.push({ type: "tool_result", tool_use_id: c.id, content: String(out) || "(no output)" });
      }
      messages.push({ role: "user", content: results });
    }

    try { await o.memory.rememberTurn(input, final); } catch (e) { emit({ type: "memory", text: `remember failed: ${/** @type {any} */ (e).message}` }); }
    return final;
  }

  return { run, messages };
}
