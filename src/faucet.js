// @ts-check
import { argon2d } from "hash-wasm";

const V1 = { version: 1, domain: "sui-faucet-pow/1", salt: "sui-faucet-pow-1", algorithm: "argon2d", argon2Version: 19, memorySize: 8192, iterations: 1, parallelism: 1, hashLength: 32 };
const HOST = "https://faucet.testnet.sui.io";

/**
 * Request testnet SUI from the official Sui faucet (v3: proof of work, no browser or captcha).
 * Spec: https://faucet.sui.io (reference client pow.js). Returns the faucet response.
 */
export async function requestTestnetSui(/** @type {string} */ recipient, /** @type {(s:string)=>void} */ log = () => {}) {
  const r = await fetch(`${HOST}/v3/challenge?recipient=${recipient}`);
  if (!r.ok) throw new Error(`faucet challenge ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const ch = await r.json();
  for (const [k, v] of Object.entries(V1)) {
    if ((k === "version" ? Number(ch[k]) : ch[k]) !== v) throw new Error(`unsupported faucet challenge (${k}=${ch[k]})`);
  }
  if (ch.recipient !== recipient) throw new Error("faucet challenge recipient mismatch");
  const threshold = (1n << 64n) / BigInt(ch.difficulty);
  const salt = new TextEncoder().encode(ch.salt);
  log(`solving faucet proof of work (~${ch.expectedAttempts} hashes)…`);
  const started = Date.now();
  const nonceBuf = new BigUint64Array(1);
  crypto.getRandomValues(nonceBuf);
  let nonce = nonceBuf[0];
  for (;;) {
    if (Date.now() - started > (Number(ch.windowSeconds) || 60) * 1000 - 5000) throw new Error("faucet challenge expired before solving; retry");
    const pre = [ch.domain, ch.chainId, String(ch.checkpointSeq), ch.checkpointDigest, ch.randomBytes, ch.faucetAddress, ch.recipient, String(nonce)].join("\n");
    const hash = await argon2d({ password: pre, salt, memorySize: ch.memorySize, iterations: ch.iterations, parallelism: ch.parallelism, hashLength: ch.hashLength, outputType: "binary" });
    let head = 0n;
    for (let i = 0; i < 8; i++) head = (head << 8n) | BigInt(hash[i]);
    if (head < threshold) {
      const res = await fetch(`${HOST}/v3/gas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient, checkpointSeq: ch.checkpointSeq, nonce: String(nonce), hashHex: Buffer.from(hash).toString("hex") }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`faucet ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      return body;
    }
    nonce = (nonce + 1n) & ((1n << 64n) - 1n);
  }
}
