import { useState } from 'react';

import { api } from '@/lib/api';
import { Drop } from './ui';

export function Login({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try { await api.login(pw); onDone(); } catch (x: any) { setErr(x.message); }
          setBusy(false);
        }}
      >
        <div style={{ display: 'grid', placeItems: 'center' }}><Drop size={44} /></div>
        <h1>SUIde</h1>
        <p style={{ margin: 0, color: 'var(--muted)' }}>{configured ? 'Enter the password to talk to your agent.' : 'This server has no SUIDE_PASSWORD set, so sign-in is disabled.'}</p>
        <input type="password" autoComplete="current-password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={!configured} aria-label="Password" />
        {err ? <div className="err">{err}</div> : null}
        <button className="pill go" disabled={!configured || !pw || busy}>{busy ? 'Signing in…' : 'Continue'}</button>
      </form>
    </div>
  );
}
