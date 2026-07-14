import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import localForage from 'localforage';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_MODE_STORAGE_KEY = 'themeMode';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getSystemPrefersDark = (): boolean =>
  window.matchMedia('(prefers-color-scheme: dark)').matches;

const isValidThemeMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemDark, setSystemDark] = useState<boolean>(getSystemPrefersDark);

  // Hydrate persisted preference
  useEffect(() => {
    localForage
      .getItem(THEME_MODE_STORAGE_KEY)
      .then((stored) => {
        if (isValidThemeMode(stored)) {
          setModeState(stored);
        }
      })
      .catch((error) => {
        console.error('[THEME] Failed to load theme mode', error);
      });
  }, []);

  // Track OS preference changes (relevant in 'system' mode)
  useEffect(() => {
    const darkModePreference = window.matchMedia(
      '(prefers-color-scheme: dark)',
    );
    const handleChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    darkModePreference.addEventListener('change', handleChange);
    return () => {
      darkModePreference.removeEventListener('change', handleChange);
    };
  }, []);

  const isDark = mode === 'system' ? systemDark : mode === 'dark';

  // Reflect active theme on the document root so plain CSS can follow the
  // manual toggle (see [data-theme] selectors in index.css and component CSS)
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localForage.setItem(THEME_MODE_STORAGE_KEY, newMode).catch((error) => {
      console.error('[THEME] Failed to persist theme mode', error);
    });
  }, []);

  const value = useMemo(
    () => ({ mode, isDark, setMode }),
    [mode, isDark, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProvider');
  }
  return context;
}
