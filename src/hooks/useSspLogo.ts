import { useThemeMode } from '../contexts/ThemeContext';

/**
 * Returns the SSP logo variant for the active theme.
 * White logo on dark backgrounds, black (#595A5A pillar) on light.
 */
export function useSspLogo(): string {
  const { isDark } = useThemeMode();
  return isDark ? '/ssp-logo-white.svg' : '/ssp-logo-black.svg';
}
