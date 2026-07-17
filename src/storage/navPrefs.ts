import localForage from 'localforage';

/**
 * Navigation preferences — Phase 3 IA.
 *
 * Invariant 6 (storage is append-only): these live in a NEW localForage key,
 * completely separate from `sspConfig`, wallet state, `themeMode`, etc. Nothing
 * here is required for correctness — a missing/corrupt value falls back to the
 * safe default (Home). Losing it never affects funds, keys or pairing.
 *
 * Note: the Menu (settings) tab is a single scrolling page, so only the last
 * TAB is remembered — there is no per-section position to restore.
 */

export type WalletTab = 'home' | 'portfolio' | 'activity' | 'settings';

const NAV_PREFS_KEY = 'navPrefs';

interface NavPrefs {
  /** The tab the popup should re-open on ("open where you left off"). */
  lastTab: WalletTab;
}

const VALID_TABS: WalletTab[] = ['home', 'portfolio', 'activity', 'settings'];

const isValidTab = (value: unknown): value is WalletTab =>
  typeof value === 'string' && VALID_TABS.includes(value as WalletTab);

export const tabToPath = (tab: WalletTab): string => `/${tab}`;

export function pathToTab(pathname: string): WalletTab | null {
  const seg = pathname.split('/').filter(Boolean)[0];
  return isValidTab(seg) ? seg : null;
}

export async function getNavPrefs(): Promise<NavPrefs> {
  try {
    const stored = await localForage.getItem<Partial<NavPrefs>>(NAV_PREFS_KEY);
    if (stored && isValidTab(stored.lastTab)) {
      return { lastTab: stored.lastTab };
    }
  } catch (error) {
    console.log('[navPrefs] read failed', error);
  }
  return { lastTab: 'home' };
}

export async function getLastTab(): Promise<WalletTab> {
  return (await getNavPrefs()).lastTab;
}

export async function setLastTab(tab: WalletTab): Promise<void> {
  if (!isValidTab(tab)) return;
  try {
    const current = await getNavPrefs();
    await localForage.setItem<NavPrefs>(NAV_PREFS_KEY, {
      ...current,
      lastTab: tab,
    });
  } catch (error) {
    console.log('[navPrefs] write failed', error);
  }
}
