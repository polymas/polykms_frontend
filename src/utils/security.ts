/**
 * 安全工具函数
 */

import { isProductionEnvironment } from './env';

/**
 * 安全的日志函数（生产环境不输出敏感信息）
 */
export const secureLog = {
  log: (...args: any[]) => {
    if (!isProductionEnvironment()) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (!isProductionEnvironment()) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    // 错误日志在生产环境也输出，但不包含敏感信息
    if (isProductionEnvironment()) {
      // 生产环境只输出错误类型，不输出详细信息
      console.error('An error occurred');
    } else {
      console.error(...args);
    }
  },
};

/**
 * 验证URL是否为HTTPS（生产环境强制）
 * @param url URL地址
 * @returns 是否为安全的HTTPS URL
 */
export function validateHTTPS(url: string): boolean {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    // 生产环境强制HTTPS
    if (isProductionEnvironment()) {
      return urlObj.protocol === 'https:';
    }
    // 开发环境允许HTTP
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 确保URL使用HTTPS（生产环境）
 * @param url URL地址
 * @returns 安全的HTTPS URL
 */
export function ensureHTTPS(url: string): string {
  if (!url) return url;

  try {
    const urlObj = new URL(url);
    // 生产环境强制转换为HTTPS
    if (isProductionEnvironment() && urlObj.protocol === 'http:') {
      urlObj.protocol = 'https:';
      return urlObj.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * 生成通用错误消息（避免泄露系统信息）
 * @param error 原始错误
 * @param defaultMessage 默认消息
 * @returns 安全的错误消息
 */
export function getSafeErrorMessage(error: any, defaultMessage: string = '操作失败'): string {
  if (isProductionEnvironment()) {
    // 生产环境只返回通用错误消息
    if (error?.response?.status === 401) {
      return '认证失败，请重新登录';
    }
    if (error?.response?.status === 403) {
      return '权限不足';
    }
    if (error?.response?.status === 404) {
      return '资源不存在';
    }
    if (error?.response?.status >= 500) {
      return '服务器错误，请稍后重试';
    }
    return defaultMessage;
  }

  // 开发环境可以显示详细错误
  return error?.response?.data?.error || error?.message || defaultMessage;
}

/**
 * 防抖函数（用于限制请求频率）
 * @param func 要防抖的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数（用于限制请求频率）
 * @param func 要节流的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

