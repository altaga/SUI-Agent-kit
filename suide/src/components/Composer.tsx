import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Stop, Up } from './ui';

type Props = {
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  focusSignal: number;
  onSend: (text: string) => void;
  onStop: () => void;
};

const coarse = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function Composer({ busy, disabled, placeholder, focusSignal, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // Desktop: focus on new chat / "/" shortcut. Touch: never steal focus, it would pop the keyboard.
  useEffect(() => { if (!coarse()) ref.current?.focus(); }, [focusSignal]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="dock">
      <div className="composer">
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          enterKeyHint="send"
          autoCapitalize="sentences"
          aria-label="Message the agent"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            if (coarse()) return; // on phones Enter is a newline; the button sends
            e.preventDefault();
            submit();
          }}
        />
        <div className="cbar">
          <span>{busy ? 'Working…' : coarse() ? '' : 'Enter to send · Shift+Enter for a new line'}</span>
          {busy ? (
            <button className="send stop" onClick={onStop} aria-label="Stop"><Stop /></button>
          ) : (
            <button className="send" onClick={submit} disabled={!text.trim() || disabled} aria-label="Send"><Up /></button>
          )}
        </div>
      </div>
      <div className="hint">SUIde runs an agent with a real wallet on testnet. Check what it does.</div>
    </div>
  );
}
