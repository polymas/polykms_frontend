import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

/**
 * 全站浅色主题：中性底 + 靛青主色，圆角与对比度偏现代控制台产品
 */
export const appTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#4f46e5',
    colorSuccess: '#059669',
    colorError: '#dc2626',
    colorWarning: '#d97706',
    borderRadiusLG: 12,
    borderRadius: 10,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f1f5f9',
    colorBorder: '#e2e8f0',
    colorBorderSecondary: '#f1f5f9',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorTextTertiary: '#94a3b8',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontFamilyCode: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    boxShadow:
      '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.06)',
    boxShadowSecondary: '0 1px 3px rgba(15, 23, 42, 0.06)',
  },
  components: {
    Layout: {
      headerBg: 'rgba(255, 255, 255, 0.72)',
      bodyBg: 'transparent',
      siderBg: '#fafbfc',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(79, 70, 229, 0.08)',
      itemHoverBg: 'rgba(15, 23, 42, 0.04)',
      itemSelectedColor: '#4f46e5',
      itemColor: '#475569',
      iconSize: 18,
    },
  },
};

export default appTheme;
