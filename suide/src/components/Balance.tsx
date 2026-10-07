import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';

type B = { network: string; address: string | null; sui: string; wal: string; usdc: string };

export function useBalance(active: boolean, refreshKey: number) {
  const [b, setB] = useState<B | null>(null);
  const refresh = useCallback(async () => {
    try { setB(await api.balance()); } catch { /* keep the last known value */ }
  }, []);
  useEffect(() => {
    if (!active) return;
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 30_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [active, refresh, refreshKey]);
  return { b, loading: b === null, refresh };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function BalanceCard({ b, loading, onRefresh }: { b: B | null; loading: boolean; onRefresh: () => void }) {
  return (
    <button className="bal" onClick={onRefresh} title="Refresh balance" aria-label="Agent balance, tap to refresh">
      <div className="bal-head">
        <span>Agent wallet</span>
        <span className="tag net">{b?.network ?? 'testnet'}</span>
      </div>
      {(['sui', 'wal', 'usdc'] as const).map((k) => (
        <div className="bal-row" key={k} style={{ opacity: loading && !b ? 0.5 : 1 }}>
          <span>{k.toUpperCase()}</span>
          <b>{b ? b[k] : '–'}</b>
        </div>
      ))}
      {b?.address ? <div className="bal-addr">{short(b.address)}</div> : null}
    </button>
  );
}

export function BalanceChips({ b, onClick }: { b: B | null; onClick: () => void }) {
  return (
    <button className="chips" onClick={onClick} aria-label="Agent balance on testnet">
      {(['sui', 'wal', 'usdc'] as const).map((k) => (
        <span className="chip" key={k}>{b ? b[k] : '–'}<i>{k.toUpperCase()}</i></span>
      ))}
    </button>
  );
}
