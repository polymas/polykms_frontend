/**
 * API服务层
 */
import axios, { AxiosInstance } from 'axios';
import { getApiBaseUrl } from './env';

// 获取API基础URL
// 如果设置了VITE_API_BASE_URL，使用该值
// 否则在开发模式下使用空字符串（走vite代理），生产模式下使用默认测试环境
const getApiBaseUrlConfig = (): string => {
  const envUrl = getApiBaseUrl();
  if (envUrl) {
    return envUrl;
  }

  // 开发模式下，如果没有设置VITE_API_BASE_URL，使用空字符串走vite代理
  if (import.meta.env.DEV) {
    return '';
  }

  // 生产模式下，默认使用测试环境
  return 'https://api.polyking.site';
};

const API_BASE_URL = getApiBaseUrlConfig();

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加JWT Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：处理401未授权和405方法不允许
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }

    // 处理405方法不允许错误
    if (error.response?.status === 405) {
      console.error('405 Method Not Allowed:', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.url ? `${error.config.baseURL}${error.config.url}` : 'unknown',
      });
      error.message = `请求方法不被允许: ${error.config?.method?.toUpperCase()} ${error.config?.url}`;
    }

    return Promise.reject(error);
  }
);

// 类型定义
export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
}

export interface RegisterResponse {
  user_id: number;
  username: string;
  message: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user_id: number;
  username: string;
  message: string;
}

export interface Secret {
  id: number;
  user_id: number;
  key_name: string;
  value?: string; // 加密后的密文（base64）
  description: string;
  status: string;
  allocated_to?: string;
  allocated_at?: string;
  created_at: string;
}

export interface StoreSecretRequest {
  key_name: string;
  value: string;
  description?: string;
}

export interface StoreSecretResponse {
  id: number;
  key_name: string;
  status: string;
  message: string;
}

export interface StoreSecretsBatchRequest {
  secrets: StoreSecretRequest[];
}

export interface StoreSecretBatchResult {
  key_name: string;
  success: boolean;
  id?: number;
  status?: string;
  error?: string;
}

export interface StoreSecretsBatchResponse {
  total: number;
  success: number;
  failed: number;
  results: StoreSecretBatchResult[];
}

export interface ListSecretsResponse {
  count: number;
  secrets: Omit<Secret, 'value'>[];
}

// API函数
export const authAPI = {
  /**
   * 注册用户
   */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await api.post<RegisterResponse>('/api/v1/auth/register', data);
    return response.data;
  },

  /**
   * 用户登录
   */
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/api/v1/auth/login', data);
    // 保存token到localStorage
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  },

  /**
   * 登出
   */
  logout: () => {
    localStorage.removeItem('token');
  },
};

export const secretsAPI = {
  /**
   * 存储密钥
   */
  storeSecret: async (data: StoreSecretRequest): Promise<StoreSecretResponse> => {
    const response = await api.post<StoreSecretResponse>('/api/v1/secrets', data);
    return response.data;
  },

  /**
   * 批量存储密钥（使用批量接口）
   */
  storeSecretsBatch: async (
    secrets: StoreSecretRequest[]
  ): Promise<{ success: StoreSecretResponse[]; failed: { secret: StoreSecretRequest; error: string }[] }> => {
    if (secrets.length === 0) {
      return { success: [], failed: [] };
    }

    try {
      const response = await api.post<StoreSecretsBatchResponse>('/api/v1/secrets/batch', {
        secrets,
      });

      // 转换响应格式以保持兼容性
      const success: StoreSecretResponse[] = [];
      const failed: { secret: StoreSecretRequest; error: string }[] = [];

      response.data.results.forEach((result, index) => {
        if (result.success) {
          success.push({
            id: result.id!,
            key_name: result.key_name,
            status: result.status!,
            message: '密钥存储成功',
          });
        } else {
          failed.push({
            secret: secrets[index],
            error: result.error || '未知错误',
          });
        }
      });

      return { success, failed };
    } catch (error: any) {
      // 如果批量接口失败，回退到逐个上传
      const success: StoreSecretResponse[] = [];
      const failed: { secret: StoreSecretRequest; error: string }[] = [];

      for (const secret of secrets) {
        try {
          const result = await secretsAPI.storeSecret(secret);
          success.push(result);
        } catch (err: any) {
          failed.push({
            secret,
            error: err.response?.data?.error || err.message || '未知错误',
          });
        }
      }

      return { success, failed };
    }
  },

  /**
   * 获取单个密钥（包含加密的value）
   */
  getSecret: async (keyName: string): Promise<Secret> => {
    const response = await api.get<Secret>(`/api/v1/secrets/${encodeURIComponent(keyName)}`);
    return response.data;
  },

  /**
   * 列出所有密钥（不包含value）
   */
  listSecrets: async (): Promise<ListSecretsResponse> => {
    const response = await api.get<ListSecretsResponse>('/api/v1/secrets');
    return response.data;
  },
};

