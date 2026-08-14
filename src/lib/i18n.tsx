import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from '../i18n/en';
import { it } from '../i18n/it';

export type Language = 'en' | 'it';
type I18nValue = { language: Language; setLanguage: (language: Language) => void; t: (english: string, values?: Record<string, string | number>) => string };
const dictionaries = { en, it };
const I18nContext = createContext<I18nValue>({ language: 'en', setLanguage: () => undefined, t: (value) => value });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('casa-language') === 'it' ? 'it' : 'en');
  useEffect(() => { localStorage.setItem('casa-language', language); document.documentElement.lang = language; }, [language]);
  const value = useMemo<I18nValue>(() => ({ language, setLanguage, t: (english, values) => {
    let translated = dictionaries[language][english] ?? english;
    for (const [key, replacement] of Object.entries(values ?? {})) translated = translated.replaceAll(`{${key}}`, String(replacement));
    return translated;
  } }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
