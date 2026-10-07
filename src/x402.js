// @ts-check
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { x402Client, x402HTTPClient, ExactSuiClientScheme } from "@altaga/x402-sui";
import { file, readJson, writeJson } from "./config.js";

export function suiClient(/** @type {"testnet"|"mainnet"} */ network) {
  return new SuiGrpcClient({ network, baseUrl: `https://fullnode.${network}.sui.io:443` });
}

const today = () => new Date().toISOString().slice(0, 10);
export const spentToday = () => (readJson(file("spend.json"), {}).date === today() ? readJson(file("spend.json"), {}).usd : 0);
const addSpend = (/** @type {number} */ usd) => writeJson(file("spend.json"), { date: today(), usd: spentToday() + usd });

/**
 * Fetch a URL, paying with the agent's Sui wallet if the server answers 402 (x402 "exact" scheme).
 * Budget policy: per-call cap, daily cap, and (unless approval=auto) interactive confirmation.
 * Amounts are assumed to be a 6-decimal stablecoin (USDC).
 * @param {{cfg:import("./config.js").Config, wallet:any, approve:(what:string)=>Promise<boolean>}} ctx
 * @param {{url:string, method?:string, headers?:Record<string,string>, body?:string}} req
 */
export async function payFetch(ctx, req) {
  const { cfg, wallet } = ctx;
  if (!wallet) throw new Error("No wallet. Run: agent init");
  const method = req.method || "GET";
  const headers = { ...(req.headers || {}) };
  if (req.body && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
  const init = (/** @type {Record<string,string>} */ h) => ({ method, headers: h, body: req.body, signal: AbortSignal.timeout(60_000) });

  const r1 = await fetch(req.url, init(headers));
  if (r1.status !== 402) return { paid: false, status: r1.status, body: await r1.text() };

  const network = cfg.network;
  const core = new x402Client();
  const scheme = new ExactSuiClientScheme(suiClient(network), wallet.keypair);
  for (const n of [`sui:${network}`, `exact:sui:${network}`]) core.register(n, scheme);
  const http = new x402HTTPClient(core);

  const required = http.getPaymentRequiredResponse((n) => r1.headers.get(n), await r1.clone().json().catch(() => undefined));
  const accept = required.accepts.find((a) => a.network?.endsWith(`sui:${network}`));
  if (!accept) throw new Error(`Server does not accept Sui ${network}: ${required.accepts.map((a) => a.network).join(", ")}`);
  const usd = Number(accept.amount) / 1e6;
  if (usd > cfg.maxPerCallUsd) throw new Error(`Price ${usd} USD exceeds per-call limit ${cfg.maxPerCallUsd} USD`);
  if (spentToday() + usd > cfg.dailyBudgetUsd) throw new Error(`Daily budget ${cfg.dailyBudgetUsd} USD would be exceeded (spent ${spentToday()})`);
  if (cfg.approval !== "auto" && !(await ctx.approve(`PAY ${usd} USD on Sui ${network} to ${new URL(req.url).host}`))) {
    throw new Error("Payment declined by user");
  }

  const payload = await http.createPaymentPayload(required);
  const r2 = await fetch(req.url, init({ ...headers, ...http.encodePaymentSignatureHeader(payload) }));
  let settlement;
  try { settlement = http.getPaymentSettleResponse((n) => r2.headers.get(n)); } catch {}
  if (r2.ok) addSpend(usd);
  return { paid: r2.ok, usd, status: r2.status, settlement, body: await r2.text() };
}
