/**
 * API服务层
 */
import axios, { AxiosInstance } from 'axios';
import { getBackendUrl, getActivityApiBaseUrl, isProductionEnvironment } from './env';
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
      localStorage.removeItem('username');
      localStorage.removeItem('is_admin');
      localStorage.removeItem('role');
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

// poly_activity 钱包活动缓存后端（无 JWT，独立基地址）
const activityApi: AxiosInstance = axios.create({
  baseURL: getActivityApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

activityApi.interceptors.request.use((config) => {
  const url = config.baseURL && config.url ? `${config.baseURL}${config.url}` : config.url;
  console.log('[poly_activity] 发送请求', {
    method: (config.method || 'get').toUpperCase(),
    url,
    params: config.params ?? undefined,
    data: config.data ?? undefined,
  });
  return config;
});

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

/** 角色：数据录入员 / 客户 / 管理员；仅用于前端 UI 显隐，鉴权以后端 JWT 为准 */
export type Role = 'data_entry' | 'customer' | 'admin';

/** 从 localStorage 读取当前角色（兼容旧版仅有 is_admin 时：无 role 则按 is_admin 推导） */
export function getRole(): Role {
  const role = localStorage.getItem('role') as Role | null;
  if (role === 'admin' || role === 'customer' || role === 'data_entry') return role;
  return localStorage.getItem('is_admin') === 'true' ? 'admin' : 'data_entry';
}

export interface LoginResponse {
  token: string;
  user_id: number;
  username: string;
  is_admin: boolean;
  role?: Role;
  message: string;
}

export interface Secret {
  id: number;
  user_id: number;
  key_name: string;
  value?: string; // 加密后的密文（base64），兼容旧字段
  active?: boolean; // 是否激活
  ip?: string; // IP地址
  proxy_address?: string; // 代理地址
  base_address?: string; // 基础地址
  private_key?: string; // 私钥（加密后）
  api_key?: string; // API密钥（明文，后端明文存储）
  api_secret?: string; // API密钥（加密后）
  api_passphrase?: string; // API密码短语（明文，后端明文存储）
  wallet_type?: string; // 钱包类型
  signature_type?: number; // 签名类型
  extra_info?: string; // 额外信息（JSON字符串）
  created_at: string;
}

export interface StoreSecretRequest {
  key_name: string;
  value?: string; // 兼容旧字段，如果设置了新字段则忽略
  active?: boolean; // 是否激活
  ip?: string; // IP地址
  proxy_address?: string; // 代理地址
  base_address?: string; // 基础地址
  private_key?: string; // 私钥（需要加密，后端会再次加密存储）
  api_key?: string; // API密钥（需要加密传输，但后端明文存储）
  api_secret?: string; // API密钥（需要加密，后端会再次加密存储）
  api_passphrase?: string; // API密码短语（需要加密传输，但后端明文存储）
  wallet_type?: string; // 钱包类型
  signature_type?: number; // 签名类型
  extra_info?: string; // 额外信息（JSON字符串）
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
    // 保存 token 与用户信息到 localStorage（注意：存在 XSS 风险，建议后端使用 httpOnly cookie）
    if (response.data.token) {
      try {
        localStorage.setItem('token', response.data.token);
        if (response.data.username) {
          localStorage.setItem('username', response.data.username);
        }
        localStorage.setItem('is_admin', String(!!response.data.is_admin));
        const role = response.data.role ?? (response.data.is_admin ? 'admin' : 'data_entry');
        localStorage.setItem('role', role);
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
  proxy_address?: string; // 代理地址
  wallet_type?: string; // 钱包类型
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

// 客户看板：快照与聚合
export interface GroupDailySnapshotItem {
  id: number;
  group_key: string;
  snapshot_date: string;
  total_assets: number;
  total_balance: number;
  position_count: number;
  order_count: number;
  key_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListDailySnapshotsResponse {
  count: number;
  snapshots: GroupDailySnapshotItem[];
}

export interface GroupAggregateResponse {
  group_key: string;
  total_assets: number;
  total_balance: number;
  position_count: number;
  order_count: number;
  key_count: number;
  /** 按资产档位统计的机器数 */
  asset_bucket_1000: number;  // 1000U+
  asset_bucket_500: number;   // 500U 档
  asset_bucket_100: number;   // 100U 档
  asset_bucket_50: number;    // 50U 档
  asset_bucket_other: number; // <50U 或无数据
}

// poly_activity 每日统计（来自 https://www.polyking.site/activity）
export interface ActivityDailyItem {
  date: string;   // YYYY-MM-DD
  volume?: number; // 当日买入额
  profit?: number; // 当日卖出盈亏
}

export interface ActivityWalletDailyStats {
  wallet: string;
  daily: ActivityDailyItem[];
}

export interface ActivityDailyStatsResponse {
  data: ActivityWalletDailyStats[];
}

/** 从 daily 项中解析出利润数值（兼容后端不同字段名与字符串），供看板聚合用 */
export function parseDailyProfit(d: Record<string, unknown>): number {
  const raw =
    (d?.profit as number | string | undefined) ??
    (d?.pnl as number | string | undefined) ??
    (d?.profit_loss as number | string | undefined);
  if (raw === undefined || raw === null) return 0;
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** 从 daily 项中解析出交易额 volume（仅买入），兼容字符串 */
export function parseDailyVolume(d: Record<string, unknown>): number {
  const raw = d?.volume as number | string | undefined;
  if (raw === undefined || raw === null) return 0;
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** poly_activity 每日统计请求体（批量接口） */
export interface ActivityDailyStatsRequest {
  wallets: string[];
  from_date: string;
  to_date: string;
}

/** 活动记录明细请求（时间区间内买入/卖出等） */
export interface ActivityRecordsRequest {
  wallets: string[];
  from_date: string;
  to_date: string;
  types?: string[];
  page?: number;
  page_size?: number;
}

/** 单条活动记录 */
export interface ActivityRecordItem {
  wallet: string;
  token_id?: string; // 资产/代币 ID，用于按资产分类聚合
  type: string;
  ts: number;
  date: string;
  size: number;
  usdc_size: number;
  pnl?: number;
}

/** 活动记录分页响应 */
export interface ActivityRecordsResponse {
  list: ActivityRecordItem[];
  total: number;
  page: number;
  page_size: number;
}

/** 地址较多时后端返回的异步任务响应，需轮询 progress_url 获取最终结果 */
export interface ActivityJobResponse {
  job_id: string;
  message: string;
  progress_url: string;
}

function isActivityJobResponse(r: unknown): r is ActivityJobResponse {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.job_id === 'string' &&
    typeof o.progress_url === 'string'
  );
}

/** 兼容后端把 job 放在 data 里返回：{ data: { job_id, message, progress_url } } */
function getJobResponseIfAny(r: unknown): ActivityJobResponse | null {
  if (typeof r !== 'object' || r === null) return null;
  const top = r as Record<string, unknown>;
  if (isActivityJobResponse(top)) return top;
  if (top.data && typeof top.data === 'object' && top.data !== null && isActivityJobResponse(top.data)) {
    return top.data as ActivityJobResponse;
  }
  return null;
}

function isActivityDailyStatsResponse(r: unknown): r is ActivityDailyStatsResponse {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Record<string, unknown>;
  return 'data' in o && Array.isArray(o.data);
}

/** 轮询时后端返回的“处理中”格式：{ id, kind, status: 'pending', total, completed, message, ... }，应继续轮询 */
function isJobPendingResponse(r: unknown): boolean {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Record<string, unknown>;
  if (o.status === 'pending') return true;
  if (typeof o.id === 'string' && (o.kind === 'daily_stats' || o.kind != null) && !Array.isArray(o.data)) return true;
  return false;
}

/** 轮询任务进度直至返回 data 或超时，间隔 2s，最多 5 分钟。优先识别 job：只要带 job_id/progress_url 就视为未完成并继续轮询 */
export async function pollDailyStatsResult(progressUrl: string): Promise<ActivityDailyStatsResponse> {
  const intervalMs = 2000;
  const maxWaitMs = 5 * 60 * 1000;
  const started = Date.now();
  let attempt = 0;
  for (; ;) {
    attempt += 1;
    const fullUrl = progressUrl.startsWith('http') ? progressUrl : `${activityApi.defaults.baseURL || ''}${progressUrl}`;
    console.log('[poly_activity] 轮询请求', { attempt, url: fullUrl });
    const res = await activityApi.get<ActivityJobResponse | ActivityDailyStatsResponse>(progressUrl);
    const body = res.data;
    const job = getJobResponseIfAny(body);
    if (job) {
      if (Date.now() - started >= maxWaitMs) {
        throw new Error(`轮询超时: ${job.message || '请稍后重试'}`);
      }
      console.log('[poly_activity] 任务处理中，继续轮询', { job_id: job.job_id });
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    if (isJobPendingResponse(body)) {
      const b = body as unknown as Record<string, unknown>;
      const msg = b.message as string | undefined;
      if (Date.now() - started >= maxWaitMs) {
        throw new Error(`轮询超时: ${msg || '请稍后重试'}`);
      }
      console.log('[poly_activity] 任务处理中，继续轮询', { id: b.id, status: b.status });
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    if (isActivityDailyStatsResponse(body)) {
      console.log('[poly_activity] 轮询完成，已拿到 data');
      return body;
    }
    console.warn('[poly_activity] 轮询收到未知响应', body);
    throw new Error('无效的轮询响应');
  }
}

/** 每日交易额/利润 API（走 polykms 后端 wallet_daily_stats，需 JWT） */
export const activityAPI = {
  /**
   * 批量获取指定钱包在日期范围内的每日交易额与利润
   * POST /api/v1/activity/daily-stats Body: { "wallets": ["0x...", ...], "from_date": "YYYY-MM-DD", "to_date": "YYYY-MM-DD" }
   */
  getDailyStats: async (
    wallets: string[],
    fromDate: string,
    toDate: string
  ): Promise<ActivityDailyStatsResponse> => {
    if (wallets.length === 0) {
      return { data: [] };
    }
    const addressList = wallets.map((a) => (a || '').toLowerCase()).filter(Boolean);
    const body: ActivityDailyStatsRequest = {
      wallets: addressList,
      from_date: fromDate,
      to_date: toDate,
    };
    const response = await api.post<ActivityDailyStatsResponse>('/api/v1/activity/daily-stats', body);
    return response.data;
  },

  /**
   * 获取指定钱包在时间区间内的活动记录明细（买入、卖出、赎回等），支持分页与 type 过滤
   * POST /api/v1/activity/records Body: ActivityRecordsRequest
   */
  getRecords: async (params: {
    wallets: string[];
    fromDate: string;
    toDate: string;
    types?: string[];
    page?: number;
    pageSize?: number;
  }): Promise<ActivityRecordsResponse> => {
    const body: ActivityRecordsRequest = {
      wallets: params.wallets.map((a) => (a || '').toLowerCase()).filter(Boolean),
      from_date: params.fromDate,
      to_date: params.toDate,
      types: params.types,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 5000,
    };
    const response = await api.post<ActivityRecordsResponse>('/api/v1/activity/records', body);
    return response.data;
  },
};

export const dashboardAPI = {
  /** 查询某分组在时间范围内的每日快照列表 */
  listDailySnapshots: async (
    groupKey: string,
    from?: string,
    to?: string
  ): Promise<ListDailySnapshotsResponse> => {
    const params: Record<string, string> = { group_key: String(groupKey) };
    if (from) params.from = from;
    if (to) params.to = to;
    const response = await api.get<ListDailySnapshotsResponse>('/api/v1/snapshots/daily', { params });
    return response.data;
  },

  /** 查询某分组的当前聚合数据（从工作机状态实时聚合） */
  getGroupAggregate: async (groupKey: string): Promise<GroupAggregateResponse> => {
    const response = await api.get<GroupAggregateResponse>('/api/v1/snapshots/aggregate', {
      params: { group_key: groupKey },
    });
    return response.data;
  },

  /** 按密钥 ID 列表聚合（看板按 key_name 字母前缀分组用） */
  getAggregateBySecretIDs: async (secretIds: number[]): Promise<GroupAggregateResponse> => {
    const response = await api.post<GroupAggregateResponse>('/api/v1/snapshots/aggregate-by-secrets', {
      secret_ids: secretIds,
    });
    return response.data;
  },

  /** 手动触发当日快照写入（仅管理员） */
  triggerDailySnapshot: async (): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/api/v1/snapshots/daily/trigger');
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

