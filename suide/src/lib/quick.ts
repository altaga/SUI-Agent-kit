export type Quick = { id: string; label: string; hint: string; prompt: string };

export const QUICK: Quick[] = [
  { id: 'wallet', label: 'Wallet', hint: 'Address and balances on testnet', prompt: "What is in my wallet? Give the address and the SUI, WAL and USDC balances on testnet." },
  { id: 'skills', label: 'Sui skills', hint: 'What the agent knows how to do', prompt: "Which Sui skills do you have? List the first six with one short line each." },
  { id: 'move', label: 'Build Move', hint: 'Create, build and test a package', prompt: "Create a Move package called hello in ~/work/hello with a public greet function and one test, then build it and run its tests with the sui CLI. Report the result." },
  { id: 'browser', label: 'Browse', hint: 'Headless Chromium at phone size', prompt: "Open https://docs.sui.io in a phone-sized browser and tell me the page title and its first three headings." },
  { id: 'walrus', label: 'Walrus memory', hint: 'Save a fact, then find it again', prompt: "Remember in Walrus: 'SUIde was demoed at Sui Basecamp 2026 in Singapore.' Then search Walrus for 'Basecamp' and show what you find." },
  { id: 'vm', label: 'Check the VM', hint: 'Uptime, memory, disk, Sui CLI', prompt: "Check this machine in one command: uptime, free memory, disk usage and the sui --version." },
  { id: 'chain', label: 'Latest checkpoint', hint: 'Live Sui testnet RPC call', prompt: "What is the latest checkpoint number on Sui testnet? Query the public RPC at https://fullnode.testnet.sui.io:443 with curl." },
];
