import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../lib/i18n';

interface TutorialStep {
  selector: string;
  title: string;
  description: string;
  openMenu?: string;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const STORAGE_PREFIX = 'house-infrastructure-studio:tutorial:v2:';
const POPOVER_WIDTH = 310;

function targetBox(selector: string): Box | undefined {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return undefined;
  const rect = element.getBoundingClientRect();
  const padding = 7;
  return {
    top: Math.max(5, rect.top - padding),
    left: Math.max(5, rect.left - padding),
    width: Math.min(window.innerWidth - 10, rect.width + padding * 2),
    height: Math.min(window.innerHeight - 10, rect.height + padding * 2)
  };
}

function popoverPosition(box: Box): CSSProperties {
  const gap = 14; const estimatedHeight = 205;
  const fitsRight = box.left + box.width + gap + POPOVER_WIDTH <= window.innerWidth - 12;
  const fitsLeft = box.left - gap - POPOVER_WIDTH >= 12;
  let left = fitsRight ? box.left + box.width + gap : fitsLeft ? box.left - gap - POPOVER_WIDTH : box.left;
  let top = box.top;
  if (!fitsRight && !fitsLeft) top = box.top + box.height + gap;
  if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, box.top - estimatedHeight - gap);
  left = Math.max(12, Math.min(left, window.innerWidth - POPOVER_WIDTH - 12));
  return { left, top, width: POPOVER_WIDTH };
}

export function ProjectTutorial({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box>();
  const popover = useRef<HTMLElement>(null);
  const storageKey = `${STORAGE_PREFIX}${projectId}`;
  const steps = useMemo<TutorialStep[]>(() => [
    { selector: '.brand', title: t('Welcome to the infrastructure editor'), description: t('This short tour shows the main areas. Everything in the project stays on this computer.') },
    { selector: '.floor-switcher', title: t('Levels and blueprints'), description: t('Switch level here, open the level manager, and calibrate blueprint underlays before drawing.') },
    { selector: '.tool-grid', title: t('Creation tools'), description: t('Create walls, rooms, structures, devices, routes, containers, and measurements from this area.') },
    { selector: '.viewport-column', title: t('3D workspace'), description: t('Draw and select in the model. Orbit with right drag, pan with middle drag, and zoom with the wheel.') },
    { selector: '.properties-panel', title: t('Properties and dimensions'), description: t('The selected wall, device, route, room, or measurement is edited precisely in this panel.') },
    { selector: '.overview-nav', title: t('Project overview'), description: t('Open the complete project report with quantities, route inventory, rooms, assets, and interactive summaries.') },
    { selector: '.light-nav', title: t('Lighting view'), description: t('Inspect light points, switches, and their documented cable continuity on the active level.') },
    { selector: '.photo-nav', title: t('Photo documentation'), description: t('Place categorized photo points in the model and keep local installation pictures with the project.') },
    { selector: '.settings-nav', title: t('Project rules'), description: t('Settings contains route planning, bend radii, clearances, appearance, device defaults, and project diagnostics.') },
    { selector: '.xray-toggle', title: t('Inspect concealed services'), description: t('X-ray makes structures transparent and enables route selection. Press X to toggle it quickly.') },
    { selector: '[data-tutorial="2d-view"]', title: t('2D plan view'), description: t('Toggle a fixed orthographic top view for precise plan editing, then switch it off to return to 3D perspective.') }
  ], [t]);

  useEffect(() => {
    let completed = false;
    try { completed = localStorage.getItem(storageKey) === 'complete'; } catch { /* local storage can be disabled */ }
    setIndex(0); setActive(!completed);
  }, [storageKey]);

  useEffect(() => {
    if (!active) return;
    const step = steps[index];
    const menuRoot = step.openMenu ? document.querySelector<HTMLElement>(`[data-tutorial="${step.openMenu}"]`) : undefined;
    const menuTrigger = menuRoot?.querySelector<HTMLButtonElement>('.toolbar-menu-trigger');
    if (menuTrigger?.getAttribute('aria-expanded') !== 'true') menuTrigger?.click();
    if (!step.openMenu) document.querySelectorAll<HTMLButtonElement>('[data-tutorial] > .toolbar-menu-trigger[aria-expanded="true"]').forEach((trigger) => trigger.click());
    const update = () => setBox(targetBox(steps[index].selector));
    let frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(update); });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [active, index, steps]);

  const finish = () => {
    try { localStorage.setItem(storageKey, 'complete'); } catch { /* the tour still closes */ }
    document.querySelectorAll<HTMLButtonElement>('[data-tutorial] > .toolbar-menu-trigger[aria-expanded="true"]').forEach((trigger) => trigger.click());
    setActive(false);
  };
  const next = () => index >= steps.length - 1 ? finish() : setIndex((current) => current + 1);

  useEffect(() => {
    if (!active) return;
    popover.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'Enter' && event.target instanceof HTMLElement && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) next();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!active || !box) return null;
  const step = steps[index];
  return <div className="project-tutorial" role="dialog" aria-modal="true" aria-label={t('Project tutorial')}>
    <div className="tutorial-shield" />
    <div className="tutorial-spotlight" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
    <aside ref={popover} tabIndex={-1} className="tutorial-popover" style={popoverPosition(box)}>
      <header><span>{t('Step {current} of {total}', { current: index + 1, total: steps.length })}</span><button type="button" onClick={finish}>{t('Skip tutorial')}</button></header>
      <strong>{step.title}</strong>
      <p>{step.description}</p>
      <footer><button type="button" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>{t('Back')}</button><div className="tutorial-progress" aria-hidden="true">{steps.map((_, stepIndex) => <i key={stepIndex} className={stepIndex === index ? 'active' : ''} />)}</div><button type="button" className="primary" onClick={next}>{t(index === steps.length - 1 ? 'Finish' : 'Next')}</button></footer>
    </aside>
  </div>;
}
