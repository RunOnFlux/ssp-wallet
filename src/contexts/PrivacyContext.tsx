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

// Own storage key — never inside sspConfig (its save flow rewrites the whole
// object; independent preferences live in independent keys).
const PRIVACY_MODE_STORAGE_KEY = 'privacyMode';

interface PrivacyContextValue {
  hidden: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue | undefined>(
  undefined,
);

/**
 * Privacy mode: blur all balances/amounts (shoulder-surfing / screen-share
 * protection). Elements opt in with the `privacy-sensitive` class; the blur is
 * applied via a `privacy-hidden` class stamped on <html>.
 */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    localForage
      .getItem(PRIVACY_MODE_STORAGE_KEY)
      .then((stored) => {
        if (typeof stored === 'boolean') {
          setHidden(stored);
        }
      })
      .catch((error) => {
        console.error('[PRIVACY] Failed to load privacy mode', error);
      });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('privacy-hidden', hidden);
  }, [hidden]);

  const togglePrivacy = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      localForage.setItem(PRIVACY_MODE_STORAGE_KEY, next).catch((error) => {
        console.error('[PRIVACY] Failed to persist privacy mode', error);
      });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ hidden, togglePrivacy }),
    [hidden, togglePrivacy],
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

export function usePrivacyMode(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) {
    throw new Error('usePrivacyMode must be used within PrivacyProvider');
  }
  return ctx;
}
