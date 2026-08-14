import { useEffect, useRef, useState } from 'react';
import { isNumericDraft, parseNumericDraft } from '../lib/numericDraft';

interface Props {
  value: number | undefined;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

const format = (value: number | undefined) => value == null || !Number.isFinite(value) ? '' : String(value);
export function DraftNumberInput({ value, onCommit, min, max, step, className, ariaLabel, disabled }: Props) {
  const [draft, setDraft] = useState(format(value)); const focused = useRef(false); const cancelNextBlur = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(format(value)); }, [value]);
  const restore = () => setDraft(format(value));
  const commit = () => {
    focused.current = false;
    if (cancelNextBlur.current) { cancelNextBlur.current = false; restore(); return; }
    const bounded = parseNumericDraft(draft, min, max);
    if (bounded == null) { restore(); return; }
    setDraft(format(bounded)); onCommit(bounded);
  };
  return <input className={className} aria-label={ariaLabel} disabled={disabled} type="text" inputMode="decimal" value={draft} data-step={step}
    onFocus={() => { focused.current = true; }} onChange={(event) => { if (isNumericDraft(event.target.value)) setDraft(event.target.value); }} onBlur={commit}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelNextBlur.current = true; event.currentTarget.blur(); } }} />;
}
