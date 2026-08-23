import { BarChart3, Download, Eye, FolderOpen, Home, Image, Lightbulb, Moon, PanelTop, Redo2, RotateCcw, Save, Settings, Sun, Undo2 } from 'lucide-react';
import type { ProjectSnapshot, ThemeMode, ViewMode } from '../../shared/types';
import type { ViewCommand } from '../editor/HouseViewport';
import { useI18n } from '../lib/i18n';
import { ToolbarMenu } from './ToolbarMenu';

interface Props {
  project: ProjectSnapshot;
  appIconUrl: string;
  saveState: 'saved' | 'saving' | 'error';
  viewMode: ViewMode;
  projection: 'perspective' | 'orthographic';
  theme: ThemeMode;
  canUndo: boolean;
  canRedo: boolean;
  page: 'editor' | 'overview' | 'light' | 'photo';
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onViewMode: (mode: ViewMode) => void;
  onToggle2D: () => void;
  onView: (command: ViewCommand) => void;
  onTheme: (theme: ThemeMode) => void;
  onOpenProjectManager: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onOpenElevation: () => void;
  onBatchExport: () => void;
  onPage: (page: 'editor' | 'overview' | 'light' | 'photo') => void;
  onOpenSettings: () => void;
}

export function TopToolbar(props: Props) {
  const { language, setLanguage, t } = useI18n();
  return <header className="top-toolbar">
    <div className="brand-area"><div className="brand"><img src={props.appIconUrl} alt="" /><div><strong>{props.project.title}</strong><span>{t('Infrastructure editor · Local only')}</span></div></div><button className={props.page === 'overview' ? 'overview-nav active' : 'overview-nav'} onClick={() => props.onPage(props.page === 'overview' ? 'editor' : 'overview')}><BarChart3 size={16} /><span>{t(props.page === 'overview' ? 'Editor' : 'Overview')}</span></button><button className={props.page === 'light' ? 'light-nav active' : 'light-nav'} onClick={() => props.onPage(props.page === 'light' ? 'editor' : 'light')}><Lightbulb size={16} /><span>{props.page === 'light' ? t('Editor') : t('Light view')}</span></button><button className={props.page === 'photo' ? 'photo-nav active' : 'photo-nav'} onClick={() => props.onPage(props.page === 'photo' ? 'editor' : 'photo')}><Image size={16} /><span>{t(props.page === 'photo' ? 'Editor' : 'Photo')}</span></button><button className="settings-nav" onClick={props.onOpenSettings}><Settings size={16} /><span>{t('Settings')}</span></button></div>
    <nav className="toolbar-actions" aria-label="Project and view actions">
      <button title={t('Open or manage projects')} onClick={props.onOpenProjectManager}><FolderOpen size={17} /><span>{t('Projects')}</span></button>
      <button className={`save-state ${props.saveState}`} title={t(props.saveState === 'saved' ? 'Saved locally' : props.saveState === 'error' ? 'Autosave is not working. Click to retry.' : 'Unsaved changes are being stored locally.')} aria-label={t(props.saveState === 'saved' ? 'Saved locally' : props.saveState === 'error' ? 'Autosave error' : 'Saving locally')} onClick={props.onSave}><Save size={17} /></button>
      <span className="separator" />
      <button title={t('Undo (Ctrl+Z)')} disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={17} /></button><button title={t('Redo (Ctrl+Y)')} disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={17} /></button>
      <span className="separator" />
      <button disabled={props.page === 'light'} className={props.viewMode === 'xray' ? 'xray-toggle active' : 'xray-toggle'} title={t(props.page === 'light' ? 'Lighting view always uses X-ray.' : 'Toggle X-ray (X): make walls transparent and reveal services')} aria-pressed={props.viewMode === 'xray'} onClick={() => props.onViewMode(props.viewMode === 'xray' ? 'normal' : 'xray')}><Eye size={17} /><span>{t(props.viewMode === 'xray' ? 'X-ray ON' : 'X-ray')}</span><kbd>X</kbd></button>
      <button data-tutorial="2d-view" className={props.projection === 'orthographic' ? 'view-2d-toggle active' : 'view-2d-toggle'} aria-pressed={props.projection === 'orthographic'}
        title={t(props.projection === 'orthographic' ? 'Disable 2D view and return to perspective' : 'Enable 2D orthographic plan view')} onClick={props.onToggle2D}>
        <PanelTop size={17} /><span>{t('2D View')}</span>
      </button>
      <button title={t('Reset camera')} onClick={() => props.onView('reset')}><RotateCcw size={17} /></button>
      <span className="separator" />
      <ToolbarMenu icon={<Download size={16} />} label={t('Export')} options={[
        { value: 'elevation', label: t('Selected wall scheme'), description: t('Orthographic technical PNG') },
        { value: 'batch', label: t('Batch wall schemes'), description: t('One PNG per selected wall') },
        { value: 'backup', label: t('Project backup'), description: t('Validated local JSON') },
        { value: 'import', label: t('Import backup'), description: t('Restore a local JSON backup') }
      ]} onSelect={(value) => { if (value === 'elevation') props.onOpenElevation(); if (value === 'batch') props.onBatchExport(); if (value === 'backup') props.onExportBackup(); if (value === 'import') props.onImportBackup(); }} />
      <div className="theme-control" aria-label={t('Theme')}><button className={props.theme === 'light' ? 'active' : ''} title={t('Light theme')} onClick={() => props.onTheme('light')}><Sun size={15} /></button><button className={props.theme === 'system' ? 'active' : ''} title={t('Use system theme')} onClick={() => props.onTheme('system')}><Home size={15} /></button><button className={props.theme === 'dark' ? 'active' : ''} title={t('Dark theme')} onClick={() => props.onTheme('dark')}><Moon size={15} /></button></div>
      <div className="language-control" aria-label="Language"><button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button><button className={language === 'it' ? 'active' : ''} onClick={() => setLanguage('it')}>IT</button></div>
    </nav>
  </header>;
}
