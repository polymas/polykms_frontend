/**
 * 环境配置工具
 */

export type Environment = 'test' | 'production';

/**
 * 获取当前环境
 */
export function getEnvironment(): Environment {
  const env = import.meta.env.VITE_ENVIRONMENT || import.meta.env.MODE;
  
  // 如果明确设置为production，返回production
  if (env === 'production' || env === 'prod') {
    return 'production';
  }
  
  // 默认返回test（安全起见）
  return 'test';
}

/**
 * 判断是否为测试环境
 */
export function isTestEnvironment(): boolean {
  return getEnvironment() === 'test';
}

/**
 * 判断是否为生产环境
 */
export function isProductionEnvironment(): boolean {
  return getEnvironment() === 'production';
}

/**
 * 获取API基础URL
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || '';
}

