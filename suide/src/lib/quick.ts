export type Quick = { id: string; label: string; hint: string; prompt: string };

export const QUICK: Quick[] = [
  { id: 'wallet', label: 'Wallet', hint: 'Address and balances on testnet', prompt: "What is in my wallet? Give the address and the SUI, WAL and USDC balances on testnet." },
  { id: 'skills', label: 'Sui skills', hint: 'What the agent knows how to do', prompt: "Which Sui skills do you have? List the first six with one short line each." },
  { id: 'move', label: 'Build Move', hint: 'Scaffold, write and test a package', prompt: "Run this one command in bash, then tell me whether the Move test passed: cd ~/work && rm -rf hello && sui move new hello && { echo 'module hello::hello;'; echo 'public fun greet(): u64 { 42 }'; echo '#[test]'; echo 'fun greet_works() { assert!(greet() == 42, 0); }'; } > hello/sources/hello.move && cd hello && sui move test" },
  { id: 'browser', label: 'Browse', hint: 'Headless Chromium at phone size', prompt: "Open https://docs.sui.io in a phone-sized browser and tell me the page title and its first three headings." },
  { id: 'walrus', label: 'Walrus memory', hint: 'Save a fact, then find it again', prompt: "Remember in Walrus: 'SUIde was demoed at Sui Basecamp 2026 in Singapore.' Then search Walrus for 'Basecamp' and show what you find." },
  { id: 'vm', label: 'Check the VM', hint: 'Uptime, memory, disk, Sui CLI', prompt: "Check this machine in one command: uptime, free memory, disk usage and the sui --version." },
  { id: 'chain', label: 'Latest checkpoint', hint: 'Live Sui testnet GraphQL call', prompt: "What is the latest checkpoint number on Sui testnet? Run: curl -s -X POST https://graphql.testnet.sui.io/graphql -H 'content-type: application/json' -d '{\"query\":\"{ checkpoint { sequenceNumber } }\"}'" },
];
