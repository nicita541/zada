import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { en } from "./en";
import { ru } from "./ru";
import { DEFAULT_LOCALE, type Locale, type TranslationDictionary, type TranslationKey } from "./types";

export { DEFAULT_LOCALE, type Locale, type TranslationKey };

const STORAGE_KEY = "zada.locale";

export const dictionaries: Record<Locale, TranslationDictionary> = {
  ru,
  en
};

export function isLocale(value: unknown): value is Locale {
  return value === "ru" || value === "en";
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getStoredLocale(storage: Storage | undefined = globalThis.localStorage): Locale {
  try {
    return resolveLocale(storage?.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setStoredLocale(locale: Locale, storage: Storage | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in private contexts; runtime state still updates.
  }
}

export function translate(locale: Locale, key: TranslationKey, values: Record<string, string | number> = {}): string {
  const value = readPath(dictionaries[resolveLocale(locale)], key) ?? readPath(dictionaries[DEFAULT_LOCALE], key) ?? key;
  return interpolate(value, values);
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    const resolved = resolveLocale(nextLocale);
    setStoredLocale(resolved);
    setLocaleState(resolved);
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return createElement(I18nContext.Provider, { value }, children);
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readPath(dictionary: TranslationDictionary, key: string): string | null {
  const value = key.split(".").reduce<unknown>((cursor, segment) => {
    if (cursor && typeof cursor === "object" && segment in cursor) {
      return (cursor as Record<string, unknown>)[segment];
    }

    return undefined;
  }, dictionary);

  return typeof value === "string" ? value : null;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match));
}
