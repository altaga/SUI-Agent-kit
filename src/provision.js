// @ts-check
import { createAccount, addDelegateKey, generateDelegateKey } from "@mysten-incubation/memwal/account";
import { requestTestnetSui } from "./faucet.js";
import { WALRUS } from "./config.js";
import { suiClient } from "./x402.js";

const MIN_SUI = 100_000_000n; // 0.1 SUI for the two setup transactions

/** Create a Walrus Memory account owned by the agent wallet and a delegate key the agent uses day to day. */
export async function provisionWalrus(/** @type {{wallet:any, network:"testnet"|"mainnet", label?:string, log?:(s:string)=>void}} */ o) {
  const log = o.log || (() => {});
  const w = WALRUS[o.network];
  const client = suiClient(o.network);
  const sui = async () => {
    const { balances } = await client.core.listBalances({ owner: o.wallet.address });
    return BigInt(balances.find((b) => b.coinType.endsWith("::sui::SUI"))?.balance ?? 0);
  };
  if ((await sui()) < MIN_SUI) {
    if (o.network !== "testnet") throw new Error(`Wallet ${o.wallet.address} needs at least 0.1 SUI on mainnet to create a Walrus Memory account.`);
    log("requesting testnet SUI from the faucet…");
    try {
      await requestTestnetSui(o.wallet.address, log);
    } catch (e) {
      throw new Error(`Faucet unavailable (${/** @type {any} */ (e).message}). Get testnet SUI for ${o.wallet.address} at https://faucet.sui.io, then run: agent init --walrus`);
    }
    for (let i = 0; i < 15 && (await sui()) < MIN_SUI; i++) await new Promise((r) => setTimeout(r, 2000));
    if ((await sui()) < MIN_SUI) throw new Error("Faucet funds did not arrive; retry in a minute or fund the wallet manually.");
  }
  const common = { packageId: w.packageId, registryId: w.registryId, suiPrivateKey: o.wallet.secretKey, suiNetwork: o.network, suiClient: client };
  log("creating Walrus Memory account…");
  const acct = await createAccount(common);
  const key = await generateDelegateKey();
  log("authorizing delegate key…");
  await addDelegateKey({ ...common, accountId: acct.accountId, publicKey: key.publicKey, label: o.label || "sui-agent-kit" });
  return { provider: /** @type {const} */ ("walrus"), accountId: acct.accountId, delegateKey: key.privateKey, serverUrl: w.relayer, namespace: "agent" };
}
