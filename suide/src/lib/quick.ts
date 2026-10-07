export type Quick = { id: string; label: string; hint: string; prompt: string };

export const QUICK: Quick[] = [
  { id: 'wallet', label: 'Wallet', hint: 'Address and balances on testnet', prompt: 'Show my wallet with wallet_info: address, SUI, WAL and USDC balances on testnet.' },
  { id: 'skills', label: 'Sui skills', hint: 'What the agent knows how to do', prompt: 'List your Sui skills with skills_list and say in one short line what each of the first six is for.' },
  { id: 'move', label: 'Build Move', hint: 'Create, build and test a package', prompt: 'Create a Move package called hello in ~/work/hello with a public greet function and one test, then build it and run its tests with the sui CLI. Report the result.' },
  { id: 'browser', label: 'Browse', hint: 'Headless Chromium at phone size', prompt: 'Use the browser tool to open https://docs.sui.io at 390x844 and tell me the page title and its first three headings.' },
  { id: 'walrus', label: 'Walrus memory', hint: 'Save a fact, then find it again', prompt: "Save this with walrus_remember: 'SUIde was demoed at Sui Basecamp 2026 in Singapore.' Then search Walrus for 'Basecamp' with walrus_recall and show what comes back." },
  { id: 'vm', label: 'Check the VM', hint: 'Uptime, memory, disk, Sui CLI', prompt: 'With one bash command, show this machine: uptime, free memory, disk usage and the sui --version.' },
  { id: 'chain', label: 'Latest checkpoint', hint: 'Live Sui testnet RPC call', prompt: 'Call the Sui testnet JSON-RPC method sui_getLatestCheckpointSequenceNumber at https://fullnode.testnet.sui.io:443 (use bash with curl) and tell me the number.' },
];
