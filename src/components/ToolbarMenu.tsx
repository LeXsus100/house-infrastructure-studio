import { ChevronDown, Check } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ToolbarMenuOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface Props<T extends string> {
  icon: ReactNode;
  label: string;
  options: ToolbarMenuOption<T>[];
  selectedValue?: T;
  tutorialId?: string;
  onSelect: (value: T) => void;
}

export function ToolbarMenu<T extends string>({ icon, label, options, selectedValue, tutorialId, onSelect }: Props<T>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  return <div className="toolbar-menu" ref={root} data-tutorial={tutorialId}>
    <button className={open ? 'toolbar-menu-trigger active' : 'toolbar-menu-trigger'} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {icon}<span>{label}</span><ChevronDown size={13} />
    </button>
    {open && <div className="toolbar-menu-popover" role="menu">
      {options.map((option) => <button key={option.value} data-tutorial={tutorialId ? `${tutorialId}-${option.value}` : undefined} role="menuitemradio" aria-checked={selectedValue === option.value} onClick={() => { onSelect(option.value); setOpen(false); }}>
        <span className="menu-check">{selectedValue === option.value && <Check size={14} />}</span>
        <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
      </button>)}
    </div>}
  </div>;
}
