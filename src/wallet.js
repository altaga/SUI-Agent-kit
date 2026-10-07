// @ts-check
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { file, readJson, writeJson } from "./config.js";

/** Load (or with create=true, generate) the agent's Sui wallet. SUI_PRIVATE_KEY overrides the file. */
export function loadWallet(create = false) {
  let secretKey = process.env.SUI_PRIVATE_KEY || readJson(file("wallet.json"), {}).secretKey;
  let created = false;
  if (!secretKey) {
    if (!create) return null;
    secretKey = Ed25519Keypair.generate().getSecretKey();
    created = true;
  }
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.getPublicKey().toSuiAddress();
  if (created) writeJson(file("wallet.json"), { address, secretKey }, true);
  return { keypair, address, secretKey, created };
}
