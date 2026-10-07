import type { ReactNode } from 'react';

type P = { size?: number };
const svg = (d: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

export const Drop = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2.5c3.3 4.1 6.6 7.4 6.6 11.3a6.6 6.6 0 0 1-13.2 0C5.4 9.9 8.7 6.6 12 2.5z" fill="var(--accent)" />
    <path d="M8.6 14.2c.5 2 2 3.2 3.9 3.3" stroke="var(--on-accent)" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".75" />
  </svg>
);
export const Menu = ({ size }: P) => svg(<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>, size);
export const Plus = ({ size }: P) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, size);
export const Close = ({ size }: P) => svg(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, size);
export const Up = ({ size }: P) => svg(<><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>, size);
export const Stop = ({ size }: P) => <svg width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>;
export const Chevron = ({ size }: P) => svg(<path d="M9 6l6 6-6 6" />, size ?? 14);
export const Spark = ({ size }: P) => svg(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />, size);

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<>)\]]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer">{t}</a>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text }: { text: string }) {
  const parts = text.split(/```/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const nl = part.indexOf('\n');
          const body = nl >= 0 && /^[\w+-]*$/.test(part.slice(0, nl).trim()) ? part.slice(nl + 1) : part;
          return <pre key={i}><code>{body.replace(/\n$/, '')}</code></pre>;
        }
        return part
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((p, j) => (
            <p key={`${i}-${j}`}>
              {p.split('\n').map((line, k, a) => (
                <span key={k}>{inline(line, `${i}-${j}-${k}`)}{k < a.length - 1 ? <br /> : null}</span>
              ))}
            </p>
          ));
      })}
    </>
  );
}
