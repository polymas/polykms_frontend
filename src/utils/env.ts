/**
 * 环境配置工具
 */

export type Environment = 'test' | 'production';

/**
 * 获取当前环境
 */
export function getEnvironment(): Environment {
  const env = import.meta.env.VITE_ENVIRONMENT;

  // 如果明确设置了 VITE_ENVIRONMENT，使用该值
  if (env === 'production' || env === 'prod') {
    return 'production';
  }

  if (env === 'test') {
    return 'test';
  }

  // 如果没有设置 VITE_ENVIRONMENT
  // 开发模式（npm run dev）时 MODE 是 'development'，默认返回 test
  // 生产构建（npm run build）时 MODE 是 'production'，但为了安全，仍然默认返回 test
  // 只有明确设置 VITE_ENVIRONMENT=production 时，才返回 production

  // 默认返回test（安全起见，确保测试环境警告始终显示，除非明确设置为 production）
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

