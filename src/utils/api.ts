/**
 * API服务层
 */
import axios, { AxiosInstance } from 'axios';
import { getBackendUrl, isProductionEnvironment } from './env';
import { validateHTTPS, ensureHTTPS, secureLog } from './security';

// 获取API基础URL
// 开发模式：固定走 vite 代理到 http://localhost:8866
// 生产模式：使用环境变量 VITE_API_BASE_URL
const getApiBaseUrlConfig = (): string => {
  // 开发模式下，固定走 vite 代理（返回空字符串）
  if (import.meta.env.DEV) {
    return '';
  }

  // 生产模式下，使用环境变量
  const apiBaseUrl = getBackendUrl();
  if (!apiBaseUrl) {
    secureLog.warn('生产环境未设置 VITE_API_BASE_URL，API 请求可能失败');
    return '';
  }

  // 生产环境强制HTTPS
  if (isProductionEnvironment() && !validateHTTPS(apiBaseUrl)) {
    secureLog.error('生产环境API URL必须使用HTTPS:', apiBaseUrl);
    throw new Error('生产环境必须使用HTTPS连接');
  }

  return ensureHTTPS(apiBaseUrl);
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

    // 处理405方法不允许错误（仅开发环境输出详细信息）
    if (error.response?.status === 405) {
      secureLog.error('405 Method Not Allowed:', {
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
      });
      // 生产环境使用通用错误消息
      if (isProductionEnvironment()) {
        error.message = '请求方法不被允许';
      } else {
        error.message = `请求方法不被允许: ${error.config?.method?.toUpperCase()} ${error.config?.url}`;
      }
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
  value?: string; // 加密后的密文（base64），兼容旧字段
  active?: boolean; // 是否激活
  server_name?: string; // 服务器名称
  ip?: string; // IP地址
  proxy_address?: string; // 代理地址
  private_key?: string; // 私钥（加密后）
  api_key?: string; // API密钥（明文，后端明文存储）
  api_secret?: string; // API密钥（加密后）
  api_passphrase?: string; // API密码短语（明文，后端明文存储）
  wallet_type?: string; // 钱包类型
  signature_type?: number; // 签名类型
  created_at: string;
}

export interface StoreSecretRequest {
  key_name: string;
  value?: string; // 兼容旧字段，如果设置了新字段则忽略
  active?: boolean; // 是否激活
  server_name?: string; // 服务器名称
  ip?: string; // IP地址
  proxy_address?: string; // 代理地址
  private_key?: string; // 私钥（需要加密，后端会再次加密存储）
  api_key?: string; // API密钥（需要加密传输，但后端明文存储）
  api_secret?: string; // API密钥（需要加密，后端会再次加密存储）
  api_passphrase?: string; // API密码短语（需要加密传输，但后端明文存储）
  wallet_type?: string; // 钱包类型
  signature_type?: number; // 签名类型
}

export interface StoreSecretResponse {
  id: number;
  key_name: string;
  active: boolean;
  message: string;
}

export interface StoreSecretsBatchRequest {
  secrets: StoreSecretRequest[];
}

export interface StoreSecretBatchResult {
  key_name: string;
  success: boolean;
  id?: number;
  active?: boolean;
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
    // 保存token到localStorage（注意：存在XSS风险，建议后端使用httpOnly cookie）
    if (response.data.token) {
      // 使用sessionStorage替代localStorage可以降低风险（关闭标签页后自动清除）
      // 但最佳方案是后端使用httpOnly cookie
      try {
        localStorage.setItem('token', response.data.token);
      } catch (e) {
        secureLog.error('保存token失败:', e);
        throw new Error('无法保存登录状态');
      }
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

// 工作机状态相关类型
export interface WorkerStatus {
  id: number;
  secret_id: number;
  key_name: string;
  ip: string;
  server_name: string;
  status: 'online' | 'offline' | 'error';
  response_time: number;
  status_code: number;
  error_msg?: string;
  data?: string; // JSON字符串格式的业务数据（/status 接口返回）
  info_data?: string; // JSON字符串格式的静态信息（/info 接口返回）
  checked_at: string;
  created_at: string;
  updated_at: string; // 更新时间，用于判断是否在线
}

export interface WorkerStatusListResponse {
  count: number;
  statuses: WorkerStatus[];
}

export interface WorkerStatusHistoryResponse {
  ip: string;
  key_name: string;
  count: number;
  history: WorkerStatus[];
}

export const secretsAPI = {
  /**
   * 存储密钥（敏感字段需要在调用前已加密）
   */
  storeSecret: async (data: StoreSecretRequest): Promise<StoreSecretResponse> => {
    // 直接发送数据（敏感字段应该已经在组件中加密）
    const response = await api.post<StoreSecretResponse>('/api/v1/secrets', data);
    return response.data;
  },

  /**
   * 批量存储密钥（敏感字段需要在调用前已加密）
   */
  storeSecretsBatch: async (
    secrets: StoreSecretRequest[]
  ): Promise<{ success: StoreSecretResponse[]; failed: { secret: StoreSecretRequest; error: string }[] }> => {
    if (secrets.length === 0) {
      return { success: [], failed: [] };
    }

    try {
      // 直接发送数据（敏感字段应该已经在组件中加密）
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
            active: result.active ?? true,
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

export const workersAPI = {
  /**
   * 获取所有工作机的最新状态
   * @param hideOffline 如果为true，后端会过滤掉所有离线机器（包括error状态）
   */
  getWorkerStatuses: async (hideOffline?: boolean): Promise<WorkerStatusListResponse> => {
    const params = hideOffline ? { hide_offline: 'true' } : {};
    const response = await api.get<WorkerStatusListResponse>('/api/v1/workers/status', { params });
    return response.data;
  },

  /**
   * 获取指定工作机的最新状态
   */
  getWorkerStatus: async (ip: string): Promise<WorkerStatus> => {
    const response = await api.get<WorkerStatus>(`/api/v1/workers/status/${encodeURIComponent(ip)}`);
    return response.data;
  },

  /**
   * 获取工作机状态历史
   */
  getWorkerStatusHistory: async (ip: string, limit?: number): Promise<WorkerStatusHistoryResponse> => {
    const params = limit ? `?limit=${limit}` : '';
    const response = await api.get<WorkerStatusHistoryResponse>(
      `/api/v1/workers/status/${encodeURIComponent(ip)}/history${params}`
    );
    return response.data;
  },

  /**
   * 手动触发检查工作机状态
   */
  checkWorkerStatus: async (ip: string): Promise<WorkerStatus> => {
    const response = await api.post<WorkerStatus>(`/api/v1/workers/status/${encodeURIComponent(ip)}/check`);
    return response.data;
  },

  /**
   * 获取特定工作机的静态信息（通过代理接口，只在加载时调用一次）
   */
  getWorkerInfo: async (ip: string): Promise<any> => {
    const response = await api.get<any>(`/api/v1/proxy/${encodeURIComponent(ip)}/info`);
    return response.data;
  },

  /**
   * 获取特定工作机的仓位信息（通过代理接口）
   */
  getWorkerPositions: async (ip: string): Promise<any> => {
    const response = await api.get<any>(`/api/v1/proxy/${encodeURIComponent(ip)}/positions`);
    return response.data;
  },

  /**
   * 通过代理接口调用工作机接口（支持所有HTTP方法）
   */
  proxyToWorker: async (ip: string, method: string, path: string, data?: any): Promise<any> => {
    const config: any = {
      method: method.toLowerCase(),
      url: `/api/v1/proxy/${encodeURIComponent(ip)}${path}`,
    };
    if (data && (method.toLowerCase() === 'post' || method.toLowerCase() === 'put' || method.toLowerCase() === 'patch')) {
      config.data = data;
    }
    const response = await api.request(config);
    return response.data;
  },
};

// 订单相关类型定义
export interface ModifyLimitOrderRequest {
  ip: string;
  token_id: string;
  price: number;
  size_rate?: number; // 仓位百分比（可选，默认100%），范围0-100
}

export interface ModifyLimitOrderResponse {
  success: boolean;
  action: 'cancel' | 'create';
  message: string;
  has_position: boolean;
  has_order: boolean;
  order_id?: string;
  canceled_id?: string;
}

// 订单API
export const ordersAPI = {
  /**
   * 改挂限价单：先查询仓位和挂单，如果有仓位有挂单就取消对应仓位挂单，如果没挂单就挂单
   */
  modifyLimitOrder: async (data: ModifyLimitOrderRequest): Promise<ModifyLimitOrderResponse> => {
    const response = await api.post<ModifyLimitOrderResponse>('/api/v1/orders/modify-limit', data);
    return response.data;
  },
};

