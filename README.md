# sui-agent-kit

Plug-and-play agents for Sui developers: **Claude** as the brain, **persistent memory on Walrus Memory**, **coding tools** (shell, files, web) and a **Sui wallet that can pay for services over x402**. It runs on a laptop, a Raspberry Pi / Jetson, or any cloud VM, with no build step and no native dependencies.

```
$ agent
sui-agent-kit | anthropic claude-sonnet-5 | memory: walrus
> remember that the staging server is the arm64 VM, then deploy the app there
```

## Why this exists

Most coding agents forget everything when the session ends and cannot spend money. This kit gives an agent three things that matter on Sui:

| Capability | How |
|---|---|
| **Memory that survives sessions and machines** | [Walrus Memory](https://docs.wal.app) (encrypted with Seal, owned by a Sui account, accessed with a revocable delegate key). Falls back to a local JSON file when not configured. |
| **A wallet of its own** | An Ed25519 Sui keypair created on first run, stored locally with `0600` permissions. |
| **Buying services** | `fetch_paid` handles HTTP 402 with [x402](https://x402.org) on Sui (`@altaga/x402-sui`, gas sponsored), inside a per-call and per-day budget. |

Every turn the agent **recalls** relevant memories, **acts** with tools in a loop, then **remembers** what mattered.

## Install

macOS, Linux, Raspberry Pi, Jetson, cloud VMs (x64 and arm64):

```sh
curl -fsSL https://raw.githubusercontent.com/altaga/SUI-Agent-kit/main/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/altaga/SUI-Agent-kit/main/install.ps1 | iex
```

The installer needs no sudo/admin rights and changes nothing outside `~/.sui-agent-kit`. If Node.js 22+ is not installed it downloads an official copy (checksum verified) into that folder. Uninstall by deleting the folder.

From a clone instead: `git clone https://github.com/altaga/SUI-Agent-kit && cd SUI-Agent-kit && npm install && node bin/agent.mjs`.

## Use

Give it a model (any one of these):

```sh
export ANTHROPIC_API_KEY=sk-ant-...          # Anthropic API
export AWS_BEARER_TOKEN_BEDROCK=...          # Claude on Amazon Bedrock (or any normal AWS credentials)
```

```sh
agent                      # interactive chat; creates a wallet on first run
agent run "summarize the git log of this repo" --auto
agent init --walrus        # create a Walrus Memory account for persistent memory
agent wallet               # address and balances
agent memory recall "staging server"
agent doctor               # checks Node, model, wallet, memory, git
```

Keys can also live in `~/.sui-agent-kit/.env` or a `.env` in the working directory.

### Persistent memory with Walrus Memory

Either let the agent create its own account:

```sh
agent init --walrus        # needs ~0.1 SUI in the agent wallet; on testnet use https://faucet.sui.io
```

or point it to an existing account (for example created in the Walrus Memory dashboard):

```sh
export MEMWAL_ACCOUNT_ID=0x...   # account object id
export MEMWAL_KEY=...            # delegate key
```

Use `--network mainnet` (or `AGENT_NETWORK=mainnet`) for mainnet; the default is testnet.

## Tools the agent has

`bash` (sh on Unix, cmd.exe on Windows; `~/.sui-agent-kit/bin` is on its PATH), `read_file`, `write_file`, `edit_file`, `list_dir`, `web_fetch`, `browser` (headless Chromium via Playwright: open, snapshot, click, fill, resize, console, screenshot), `fetch_paid` (x402), `wallet_info`, `memory_remember`, `memory_recall`, `walrus_recall`/`walrus_remember` (when Walrus Memory is configured), `skills_list`/`skill_load` (the MystenLabs Sui skills in `.claude/skills`).

For remote development install the optional browser once with `agent install-browser`, and the `sui` CLI into `~/.sui-agent-kit/bin` so the agent can build, test and publish Move packages. `agent doctor` reports both.

## Safety model

- **Approval by default.** `bash`, file writes/edits and payments ask `[y/N]` in the terminal. Without a TTY they are denied unless you pass `--auto`.
- **Payment budget.** `maxPerCallUsd` (default 0.05) and `dailyBudgetUsd` (default 0.5) in `~/.sui-agent-kit/config.json`. Amounts are treated as a 6-decimal stablecoin (USDC). Fund the agent wallet with only what you are willing to let it spend.
- **No secrets in the repo.** The wallet key, delegate key, API keys and memory live only in `~/.sui-agent-kit` (override with `AGENT_HOME`). `.gitignore` excludes them.
- **Walrus Memory uses a delegate key**, not your wallet key: it can be revoked on-chain without touching the wallet.
- The agent runs commands with your user's permissions. Use a VM or container for untrusted tasks.

## SUIde: the web app

`suide/` is an Expo (web, server output) chat app, modelled on the Claude interface, for talking to a remote agent from a phone or a desktop browser. It shows the agent wallet (SUI / WAL / USDC on testnet), multiple chats with three memory modes (local, Walrus on demand, Walrus sync), approval cards for shell commands and payments, and a one-click demo, "The agent that never forgets": machine A pays on Sui testnet and saves what it learned to Walrus, is wiped, and machine B recovers the facts from Walrus and verifies the transaction on-chain.

```sh
agent serve --port 8787                       # agent API, loopback only, bearer token in ~/.sui-agent-kit/web-token
cd suide && npm ci && npx expo export -p web  # build
SUIDE_PASSWORD=... SUIDE_SESSION_SECRET=... AGENT_URL=http://127.0.0.1:8787 node server.mjs   # serves on 127.0.0.1:3000
```

Put a TLS reverse proxy (for example Caddy) in front of port 3000 and keep 8787 closed.

Security model: the browser never sees the agent token. Expo API routes act as a backend-for-frontend: password login, signed HttpOnly SameSite=Strict session cookie, same-origin checks, login throttling and an allowlist of agent routes. Tool calls that run shell commands or pay stay in `ask` mode, so the signed-in user approves each one.

## Use as an SDK

```js
import { createAgent, createModel, selectMemory, loadWallet, loadConfig, loadEnv } from "sui-agent-kit";

loadEnv();
const cfg = loadConfig();
const agent = createAgent({
  model: createModel(cfg),
  memory: selectMemory(cfg),
  wallet: loadWallet(true),
  cfg: { ...cfg, approval: "auto" },
  onEvent: (e) => console.log(e.type, e.text),
});
console.log(await agent.run("What did we decide about the staging server?"));
```

Custom tools are plain objects `{ name, description, input_schema, run(input, ctx) }` passed as `tools`.

## Layout

```
bin/agent.mjs     CLI entry (checks Node >= 22)
src/agent.js      recall -> tool loop -> remember
src/model.js      Anthropic API or Bedrock, auto-detected
src/memory.js     Walrus Memory + local fallback
src/tools.js      shell, files, web, wallet, memory tools
src/x402.js       paying fetch with budget policy
src/provision.js  creates a Walrus Memory account + delegate key
src/cli.js        commands
src/server.js     agent HTTP API (sessions, SSE chat, balance, demo)
src/browser.js    Playwright browser tool
suide/            SUIde web app (Expo, server output)
install.sh / install.ps1
```

Plain ESM JavaScript with JSDoc types (checked with `npm run typecheck`), so it runs unchanged from `node_modules`, without a build step. Tests: `npm test`.

## Status

Early (v0.1). Tested on Linux arm64 (Jetson and an AWS Graviton VM). The Windows installer follows the same steps but has had less testing; please open an issue if something breaks. x402 payments assume a 6-decimal stablecoin.

## License

MIT
