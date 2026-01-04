/**
 * 输入验证工具函数
 */

/**
 * 验证用户名
 * @param username 用户名
 * @returns 验证结果 { valid: boolean, error?: string }
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: '用户名不能为空' };
  }

  const trimmed = username.trim();

  // 长度限制：3-50 字符
  if (trimmed.length < 3) {
    return { valid: false, error: '用户名至少需要3个字符' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: '用户名不能超过50个字符' };
  }

  // 只允许字母、数字、下划线、连字符
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(trimmed)) {
    return { valid: false, error: '用户名只能包含字母、数字、下划线和连字符' };
  }

  return { valid: true };
}

/**
 * 验证密码强度
 * @param password 密码
 * @returns 验证结果 { valid: boolean, strength: 'weak' | 'medium' | 'strong', error?: string }
 */
export function validatePassword(password: string): {
  valid: boolean;
  strength: 'weak' | 'medium' | 'strong';
  error?: string;
} {
  if (!password || password.length === 0) {
    return { valid: false, strength: 'weak', error: '密码不能为空' };
  }

  // 最小长度：8 字符
  if (password.length < 8) {
    return { valid: false, strength: 'weak', error: '密码至少需要8个字符' };
  }

  // 最大长度：128 字符（防止DoS）
  if (password.length > 128) {
    return { valid: false, strength: 'weak', error: '密码不能超过128个字符' };
  }

  // 检查密码强度
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  let score = 0;

  // 包含小写字母
  if (/[a-z]/.test(password)) score++;
  // 包含大写字母
  if (/[A-Z]/.test(password)) score++;
  // 包含数字
  if (/[0-9]/.test(password)) score++;
  // 包含特殊字符
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  // 长度加分
  if (password.length >= 12) score++;

  if (score >= 4) {
    strength = 'strong';
  } else if (score >= 3) {
    strength = 'medium';
  }

  // 基本要求：至少包含字母和数字
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, strength: 'weak', error: '密码必须包含至少一个字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, strength: 'weak', error: '密码必须包含至少一个数字' };
  }

  // 检查常见弱密码
  const commonPasswords = [
    'password',
    'password123',
    '12345678',
    'qwerty123',
    'admin123',
    '123456789',
    'password1',
  ];
  if (commonPasswords.includes(password.toLowerCase())) {
    return { valid: false, strength: 'weak', error: '密码过于简单，请使用更复杂的密码' };
  }

  return { valid: true, strength };
}

/**
 * 验证邮箱
 * @param email 邮箱地址
 * @returns 验证结果 { valid: boolean, error?: string }
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || email.trim().length === 0) {
    return { valid: true }; // 邮箱是可选的
  }

  const trimmed = email.trim();

  // 基本邮箱格式验证
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: '邮箱格式不正确' };
  }

  // 长度限制
  if (trimmed.length > 255) {
    return { valid: false, error: '邮箱地址过长' };
  }

  return { valid: true };
}

/**
 * 清理和转义用户输入（防止XSS）
 * @param input 用户输入
 * @returns 清理后的字符串
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  // 移除潜在的脚本标签
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '') // 移除事件处理器
    .trim();
}

/**
 * 验证密钥名称
 * @param keyName 密钥名称
 * @returns 验证结果 { valid: boolean, error?: string }
 */
export function validateKeyName(keyName: string): { valid: boolean; error?: string } {
  if (!keyName || keyName.trim().length === 0) {
    return { valid: false, error: '密钥名称不能为空' };
  }

  const trimmed = keyName.trim();

  // 长度限制：1-100 字符
  if (trimmed.length < 1) {
    return { valid: false, error: '密钥名称不能为空' };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: '密钥名称不能超过100个字符' };
  }

  // 禁止特殊字符（防止路径遍历等攻击）
  const dangerousChars = /[<>:"|?*\x00-\x1f]/;
  if (dangerousChars.test(trimmed)) {
    return { valid: false, error: '密钥名称包含非法字符' };
  }

  return { valid: true };
}

/**
 * 验证IP地址
 * @param ip IP地址
 * @returns 验证结果 { valid: boolean, error?: string }
 */
export function validateIP(ip: string): { valid: boolean; error?: string } {
  if (!ip || ip.trim().length === 0) {
    return { valid: true }; // IP是可选的
  }

  const trimmed = ip.trim();

  // IPv4 格式验证
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6 格式验证（简化版）
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  if (!ipv4Regex.test(trimmed) && !ipv6Regex.test(trimmed)) {
    return { valid: false, error: 'IP地址格式不正确' };
  }

  return { valid: true };
}

/**
 * 验证URL
 * @param url URL地址
 * @returns 验证结果 { valid: boolean, error?: string }
 */
export function validateURL(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim().length === 0) {
    return { valid: true }; // URL是可选的
  }

  const trimmed = url.trim();

  try {
    const urlObj = new URL(trimmed);
    // 只允许 http 和 https 协议
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return { valid: false, error: 'URL必须使用HTTP或HTTPS协议' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'URL格式不正确' };
  }
}

