#!/usr/bin/env node
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`sui-agent-kit needs Node.js >= 22 (found ${process.versions.node}). Run the installer, it fetches Node for you.`);
  process.exit(1);
}
const { main } = await import("../src/cli.js");
await main(process.argv.slice(2));
