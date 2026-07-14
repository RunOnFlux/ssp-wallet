import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

/**
 * SSP Wallet Theme Configuration
 *
 * Implements the canonical SSP design tokens (see DESIGN_TOKENS.md at the
 * ecosystem root). Uses Ant Design token-based theming with the built-in
 * algorithms as base: defaultAlgorithm (light) / darkAlgorithm (dark) derive
 * all secondary tokens (hover/active states, semantic backgrounds, control
 * tints), with the warm stone palette overriding the surfaces. Matches
 * ssp-enterprise-app and ssp-relay-dashboard.
 *
 * Color Palette:
 * - Primary: Amber #fbbf24 — text/icons on primary fills are BLACK, never white
 * - Semantic: success #22c55e / warning #f59e0b / error #ef4444 / info #3b82f6
 * - Neutrals: warm stone (light bg #fafaf9, dark bg #0c0a09)
 */

// Shared tokens
const sharedTokens = {
  colorPrimary: '#fbbf24',
  colorSuccess: '#22c55e',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  colorInfo: '#3b82f6',
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: 14,
  // Motion
  motionDurationFast: '0.1s',
  motionDurationMid: '0.15s',
  motionDurationSlow: '0.3s',
};

export const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...sharedTokens,
    // Base colors
    colorTextBase: '#1c1917',
    // Links follow the brand (antd seeds colorLink from blue, not colorPrimary)
    colorLink: '#d97706',
    colorBgBase: '#fafaf9',
    // Background
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#fafaf9',
    colorBgSpotlight: '#f5f5f4',
    // Border
    colorBorder: '#e7e5e4',
    colorBorderSecondary: '#d6d3d1',
    // Text
    colorText: '#1c1917',
    colorTextSecondary: '#57534e',
    colorTextTertiary: '#78716c',
    colorTextQuaternary: '#a8a29e',
    // Fill (for backgrounds of interactive elements)
    colorFill: '#f5f5f4',
    colorFillSecondary: '#e7e5e4',
    colorFillTertiary: '#d6d3d1',
    colorFillQuaternary: '#fafaf9',
    // Split (dividers)
    colorSplit: '#e7e5e4',
  },
  components: {
    Button: {
      primaryColor: '#000000',
      algorithm: true,
      controlHeight: 32,
    },
    Modal: {
      contentBg: '#ffffff',
      headerBg: 'transparent',
      titleFontSize: 18,
      borderRadiusLG: 16,
    },
    Input: {
      activeBorderColor: '#fbbf24',
      hoverBorderColor: '#d6d3d1',
    },
    Table: {
      headerBg: '#f5f5f4',
      headerColor: '#57534e',
      rowHoverBg: '#fafaf9',
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Alert: {
      borderRadiusLG: 8,
    },
    Message: {
      contentBg: '#ffffff',
    },
    Tooltip: {
      colorBgSpotlight: '#1c1917',
      colorTextLightSolid: '#fafaf9',
    },
    Dropdown: {
      paddingBlock: 8,
      borderRadiusLG: 12,
    },
  },
};

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...sharedTokens,
    // Base colors
    colorTextBase: '#fafaf9',
    // Links follow the brand (antd seeds colorLink from blue, not colorPrimary)
    colorLink: '#fbbf24',
    colorBgBase: '#0c0a09',
    // Background - flat dark surfaces (relay dashboard pattern)
    colorBgContainer: '#0c0a09',
    // Elevated surfaces (modals, dropdowns, popovers) must visibly separate
    // from the flat page background — same hue family, one step lighter.
    colorBgElevated: '#1a1918',
    colorBgLayout: '#0c0a09',
    // Stronger mask: the default 45% black barely dims near-black content
    colorBgMask: 'rgba(0, 0, 0, 0.72)',
    colorBgSpotlight: '#1a1918',
    // Border
    colorBorder: '#272524',
    colorBorderSecondary: '#3d3a38',
    // Text
    colorText: '#fafaf9',
    colorTextSecondary: '#a8a29e',
    colorTextTertiary: '#78716c',
    colorTextQuaternary: '#57534e',
    // Fill
    colorFill: '#272524',
    colorFillSecondary: '#1a1918',
    colorFillTertiary: '#141312',
    colorFillQuaternary: '#0f0e0d',
    // Split
    colorSplit: '#272524',
  },
  components: {
    Button: {
      primaryColor: '#000000',
      algorithm: true,
      controlHeight: 32,
    },
    Modal: {
      contentBg: '#1a1918',
      headerBg: 'transparent',
      titleFontSize: 18,
      titleColor: '#fafaf9',
      borderRadiusLG: 16,
    },
    Input: {
      colorBorder: '#272524',
      activeBorderColor: '#fbbf24',
      hoverBorderColor: '#3d3a38',
    },
    Select: {
      optionSelectedBg: 'rgba(251, 191, 36, 0.16)',
      optionActiveBg: 'rgba(255, 255, 255, 0.06)',
      optionSelectedFontWeight: 600,
    },
    Table: {
      headerBg: '#272524',
      headerColor: '#a8a29e',
      rowHoverBg: '#1a1918',
      rowSelectedBg: 'rgba(251, 191, 36, 0.16)',
      rowSelectedHoverBg: 'rgba(251, 191, 36, 0.22)',
      colorBgContainer: 'transparent',
    },
    Dropdown: {
      colorBgElevated: '#1a1918',
      paddingBlock: 8,
      borderRadiusLG: 12,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Alert: {
      borderRadiusLG: 8,
    },
    Message: {
      contentBg: '#1a1918',
    },
    Tooltip: {
      colorBgSpotlight: '#272524',
      colorTextLightSolid: '#fafaf9',
    },
    Steps: {
      colorPrimary: '#fbbf24',
    },
  },
};
