import React, { useState, useEffect, useRef } from 'react';
import { Button, Space, Tag, Tooltip, Spin } from 'antd';
import { ReloadOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { workersAPI, WorkerStatus as WorkerStatusType } from '../utils/api';
import { secureLog } from '../utils/security';
import './WorkerStatus.css';

/**
 * 代理地址在表格中的缩略展示（如 0x123456...654321）；复制等操作仍应使用原始完整字符串。
 */
function abbreviateProxyAddressForDisplay(addr: string): string {
  const t = addr.trim();
  if (!t) return '-';
  const lower = t.startsWith('0x') || t.startsWith('0X');
  if (lower) {
    const hex = t.slice(2);
    if (hex.length <= 12) return t;
    return `0x${hex.slice(0, 6)}...${hex.slice(-6)}`;
  }
  if (t.length > 18) {
    return `${t.slice(0, 8)}...${t.slice(-6)}`;
  }
  return t;
}

import { getRole } from '../utils/api';

function CustomerWorkerStatus() {
  const [statuses, setStatuses] = useState<WorkerStatusType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      workersAPI.getWorkerStatuses().then((res) => {
        // customer 视角只看在线（updated_at / checked_at 60s 内）
        const all = res.statuses || [];
        const online = all.filter((s) => {
          const t = s.updated_at || s.checked_at;
          if (!t) return false;
          return Date.now() - new Date(t).getTime() <= 60 * 1000;
        });
        setStatuses(online);
      }).catch(() => {}).finally(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const online = statuses.filter((s) => s.status === 'online').length;

  return (
    <div className="worker-status-container">
      <header className="worker-status-page-head">
        <div className="worker-status-page-head-text">
          <h1 className="worker-status-title">工作机状态</h1>
          <p className="worker-status-subtitle">在线 {online} / 总数 {statuses.length} · 自动刷新</p>
        </div>
      </header>
      <div className="stats-container-top">
        <div className="stat-item-top stat-online">
          <span className="stat-label">在线</span>
          <span className="stat-value">{online}</span>
        </div>
        <div className="stat-item-top stat-offline">
          <span className="stat-label">离线</span>
          <span className="stat-value">{statuses.length - online}</span>
        </div>
        <div className="stat-item-top">
          <span className="stat-label">总数</span>
          <span className="stat-value">{statuses.length}</span>
        </div>
      </div>
      <div className="main-layout">
        <div className="main-content">
          {loading ? (
            <div className="loading-wrap"><Spin size="large" tip="加载中…" /></div>
          ) : (
            <div className="table-container">
              <table className="worker-status-table">
                <thead>
                  <tr>
                    <th>密钥名称</th>
                    <th>代理地址</th>
                    <th>状态</th>
                    <th style={{ textAlign: 'right' }}>持仓数</th>
                    <th style={{ textAlign: 'right' }}>挂单数</th>
                  </tr>
                </thead>
                <tbody>
                  {statuses.map((s) => {
                    let posCount = 0, ordCount = 0;
                    try {
                      const d = s.data ? JSON.parse(s.data) : {};
                      posCount = d.position_count ?? d.positions ?? 0;
                      ordCount = d.order_count ?? d.orders ?? 0;
                    } catch {}
                    return (
                      <tr key={s.id}>
                        <td>{s.key_name || '-'}</td>
                        <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>{s.proxy_address ? abbreviateProxyAddressForDisplay(s.proxy_address) : '-'}</td>
                        <td><Tag color={s.status === 'online' ? 'green' : 'red'}>{s.status === 'online' ? '在线' : '离线'}</Tag></td>
                        <td style={{ textAlign: 'right' }}>{posCount}</td>
                        <td style={{ textAlign: 'right' }}>{ordCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkerStatus() {
  if (getRole() === 'customer') return <CustomerWorkerStatus />;

  const [statuses, setStatuses] = useState<WorkerStatusType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'ip',
    'key_name',
    'proxy_address',
    'status',
    'response_time',
    'checked_at',
    'position_count',
    'order_count',
    'tail_order_share',
    'balance',
    'total_assets',
    'version_number',
  ]);
  // 自动刷新功能（可在页面上暂停/恢复）
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval] = useState(10); // 秒
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>(''); // 搜索关键词
  const [sortField, setSortField] = useState<string>('ip'); // 排序字段
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // 排序顺序
  const [currentPage, setCurrentPage] = useState<number>(1); // 当前页
  const [pageSize, setPageSize] = useState<number>(10); // 每页条数；默认 10，可选 10/20/50/100/500

  // 使用 ref 保存最新状态，避免闭包问题
  const statusesRef = useRef<WorkerStatusType[]>([]);

  // 同步 ref 和 state
  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  // 注：原"从数据分析页跳转后展开指定行"逻辑已废弃（展开功能整体移除）

  // 可选的字段列表
  const availableFields = [
    { key: 'ip', label: 'IP地址' },
    { key: 'key_name', label: '密钥名称' },
    { key: 'proxy_address', label: '代理地址' },
    { key: 'wallet_type', label: '钱包类型' },
    { key: 'status', label: '状态' },
    { key: 'response_time', label: '响应时间(ms)' },
    { key: 'status_code', label: 'HTTP状态码' },
    { key: 'error_msg', label: '错误信息' },
    { key: 'checked_at', label: '检查时间' },
    { key: 'created_at', label: '创建时间' },
    { key: 'position_count', label: '持仓数' },
    { key: 'order_count', label: '挂单数' },
    { key: 'tail_order_share', label: '尾盘下注份额' },
    { key: 'balance', label: 'USDC余额' },
    { key: 'total_assets', label: '资产总额' },
    { key: 'version_number', label: '程序版本号' },
  ];

  // 从状态数据中解析 info_data
  const parseInfoData = (infoDataStr?: string): Record<string, any> | null => {
    if (!infoDataStr || infoDataStr === '{}' || infoDataStr.trim() === '') return null;
    try {
      const parsed = JSON.parse(infoDataStr);
      // 如果是空对象，返回 null
      if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0) {
        return null;
      }
      return parsed;
    } catch (e) {
      secureLog.warn('解析 info_data 失败:', e, infoDataStr?.substring(0, 100));
      return null;
    }
  };

  // 加载工作机动态状态（定时调用）
  const loadStatuses = async () => {
    try {
      setLoading(true);
      setError('');

      // 后端总是返回 secrets 全集 + worker_status 合并；前端按时间口径判断在线
      const response = await workersAPI.getWorkerStatuses();
      secureLog.log('加载工作机状态响应:', response);
      // 调试：检查是否有 info_data 字段
      if (response && response.statuses && response.statuses.length > 0) {
        const firstStatus = response.statuses[0];
        secureLog.log('第一个工作机状态示例:', {
          ip: firstStatus.ip,
          has_info_data: !!firstStatus.info_data,
          info_data_length: firstStatus.info_data?.length || 0,
          info_data_preview: firstStatus.info_data?.substring(0, 200),
          has_data: !!firstStatus.data,
          data_length: firstStatus.data?.length || 0,
        });
      }
      if (response && response.statuses) {
        // 按IP去重，保留最新的状态
        // error 状态统一视为 offline，不再特殊处理
        const statusMap = new Map<string, WorkerStatusType>();
        response.statuses.forEach((status) => {
          const existing = statusMap.get(status.ip);
          if (!existing) {
            statusMap.set(status.ip, status);
          } else {
            // 比较更新时间，优先使用updated_at，如果没有则使用checked_at
            const existingTime = existing.updated_at
              ? new Date(existing.updated_at).getTime()
              : (existing.checked_at ? new Date(existing.checked_at).getTime() : 0);
            const currentTime = status.updated_at
              ? new Date(status.updated_at).getTime()
              : (status.checked_at ? new Date(status.checked_at).getTime() : 0);
            if (currentTime > existingTime) {
              statusMap.set(status.ip, status);
            }
          }
        });

        // 转换为数组
        const uniqueStatuses = Array.from(statusMap.values());
        setStatuses(uniqueStatuses);

        secureLog.log('去重前数量:', response.statuses.length, '去重后数量:', uniqueStatuses.length);

        // 调试：记录错误状态的工作机（error 状态统一显示为 offline，但日志中仍记录）
        const errorStatuses = uniqueStatuses.filter(s => s.status === 'error');
        if (errorStatuses.length > 0) {
          secureLog.log('错误状态工作机（前端显示为离线）:', errorStatuses.map(s => `${s.ip}(${s.key_name}): ${s.error_msg || '无错误信息'}`));
        }

        // 调试：检查是否有重复IP
        const ipCounts = new Map<string, number>();
        response.statuses.forEach(s => {
          ipCounts.set(s.ip, (ipCounts.get(s.ip) || 0) + 1);
        });
        const duplicateIPs = Array.from(ipCounts.entries()).filter(([_, count]) => count > 1);
        if (duplicateIPs.length > 0) {
          secureLog.warn('发现重复IP:', duplicateIPs.map(([ip, count]) => `${ip}: ${count}条记录`));
        }
      } else {
        secureLog.warn('响应数据格式异常:', response);
        // 响应格式异常时也保留之前的数据
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || '加载工作机状态失败';
      setError(errorMsg);
      secureLog.error('加载工作机状态失败:', err);
      // 请求失败时保留之前的数据，不清空 statuses
    } finally {
      setLoading(false);
    }
  };

  // 显示 Toast 提示
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000); // 3秒后自动消失
  };

  // 初始加载：加载状态数据（包含 info 和 status）
  useEffect(() => {
    loadStatuses();
  }, []);

  // 自动刷新：只刷新动态status数据
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadStatuses();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // 根据检查时间判断工作机是否在线（一分钟内算在线）
  const isWorkerOnline = (workerStatus: WorkerStatusType): boolean => {
    // 优先使用updated_at，如果没有则使用checked_at
    const timeStr = workerStatus.updated_at || workerStatus.checked_at;
    if (!timeStr) {
      return false;
    }

    try {
      const checkTime = new Date(timeStr).getTime();
      const now = Date.now();
      const diffMs = now - checkTime;
      // 一分钟 = 60 * 1000 毫秒
      return diffMs <= 60 * 1000;
    } catch {
      return false;
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-CN');
    } catch {
      return timeStr;
    }
  };

  // 解析业务数据
  const parseBusinessData = (dataStr?: string): Record<string, any> | null => {
    if (!dataStr) return null;
    try {
      return JSON.parse(dataStr);
    } catch {
      return null;
    }
  };

  // 从业务数据中提取代理钱包地址
  // 优先从 info_data 中查找，如果没找到再从 data 中查找
  const getProxyWalletAddress = (infoDataStr?: string, dataStr?: string): string | null => {
    // 先尝试从 info_data 中查找
    if (infoDataStr) {
      const infoData = parseInfoData(infoDataStr);
      if (infoData) {
        for (const [key, value] of Object.entries(infoData)) {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'proxy_wallet' || lowerKey === 'proxy_wallet_address' ||
            lowerKey === 'wallet.proxy_address' || lowerKey === 'wallet.proxy_wallet' ||
            key === 'WALLET.PROXY_ADDRESS' || key === 'WALLET.PROXY_WALLET' ||
            key.includes('代理钱包') || key.includes('代理地址') ||
            /proxy.*wallet/i.test(key) || /proxy.*address/i.test(key)) {
            return String(value);
          }
        }
      }
    }

    // 如果 info_data 中没找到，再从 data 中查找
    if (dataStr) {
      const businessData = parseBusinessData(dataStr);
      if (businessData) {
        for (const [key, value] of Object.entries(businessData)) {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'proxy_wallet' || lowerKey === 'proxy_wallet_address' ||
            lowerKey === 'wallet.proxy_address' || lowerKey === 'wallet.proxy_wallet' ||
            key === 'WALLET.PROXY_ADDRESS' || key === 'WALLET.PROXY_WALLET' ||
            key.includes('代理钱包') || key.includes('代理地址') ||
            /proxy.*wallet/i.test(key) || /proxy.*address/i.test(key)) {
            return String(value);
          }
        }
      }
    }
    return null;
  };

  // 从业务数据中提取关键字段值
  // 支持传入字符串（JSON字符串）或对象
  const getKeyMetricValue = (data: string | Record<string, any> | undefined, fieldName: string): string => {
    if (!data) return '-';

    // 如果传入的是对象，直接使用；如果是字符串，先解析
    let businessData: Record<string, any> | null;
    if (typeof data === 'string') {
      // 如果是空字符串或空JSON对象，返回 '-'
      if (data === '{}' || data.trim() === '') return '-';
      businessData = parseBusinessData(data);
    } else {
      businessData = data;
    }

    if (!businessData || Object.keys(businessData).length === 0) return '-';

    // 查找匹配的字段（支持中英文）
    for (const [key, value] of Object.entries(businessData)) {
      if (fieldName === 'position_count' && (
        key.includes('持仓') || key.includes('持仓数') ||
        /position.*count/i.test(key) || /positions/i.test(key)
      )) {
        return String(value);
      }
      if (fieldName === 'order_count' && (
        key.includes('挂单') || key.includes('挂单数') ||
        /order.*count/i.test(key) || /orders/i.test(key)
      )) {
        return String(value);
      }
      if (fieldName === 'tail_order_share') {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'tail_order_share' || lowerKey === 'tailordershare' ||
          /tail.*order.*share/i.test(key)) {
          return String(value);
        }
        // 兼容 extra_info 为对象或 JSON 字符串的场景
        if (lowerKey === 'extra_info' || lowerKey === 'extrainfo') {
          let extraInfoObj: any = value;
          if (typeof value === 'string') {
            try {
              extraInfoObj = JSON.parse(value);
            } catch {
              extraInfoObj = null;
            }
          }
          if (extraInfoObj && typeof extraInfoObj === 'object') {
            const tail = extraInfoObj.tail_order_share ?? extraInfoObj.tailOrderShare;
            if (tail !== undefined && tail !== null && tail !== '') {
              return String(tail);
            }
          }
        }
      }
      if (fieldName === 'balance') {
        // 优先精确匹配 usdc_balance 字段（不区分大小写）
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'usdc_balance' || lowerKey === 'wallet.usdc_balance' ||
          key === 'WALLET.USDC_BALANCE' || key === 'WALLET.USDC_BALANCE') {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            return numValue.toFixed(2);
          }
          return String(value);
        }
        // 其次匹配包含 usdc 和 balance 的字段（排除 pol_balance）
        if ((/usdc.*balance/i.test(key) || /balance.*usdc/i.test(key)) &&
          !/pol.*balance/i.test(key) && !/balance.*pol/i.test(key)) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            return numValue.toFixed(2);
          }
          return String(value);
        }
        // 不匹配其他余额字段（如 pol_balance）
      }
      if (fieldName === 'position_value') {
        // 匹配 positions.value 或类似字段
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'positions.value' || lowerKey === 'position.value' ||
          key === 'positions.value' || key === 'POSITIONS.VALUE' ||
          key === 'position.value' || key === 'POSITION.VALUE' ||
          (key.includes('仓位') && key.includes('价值')) ||
          (key.includes('持仓') && key.includes('价值')) ||
          /position.*value/i.test(key)) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            return numValue.toFixed(2);
          }
          return String(value);
        }
        // 尝试从嵌套对象中获取
        if (typeof value === 'object' && value !== null) {
          const nestedValue = (value as any).value;
          if (nestedValue !== undefined) {
            const numValue = Number(nestedValue);
            if (!isNaN(numValue)) {
              return numValue.toFixed(2);
            }
            return String(nestedValue);
          }
        }
      }
      // total_assets 的计算在循环外统一处理
      if (fieldName === 'version_number') {
        // 匹配 version.number 或类似字段
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'version.number' || lowerKey === 'version' ||
          key === 'version.number' || key === 'VERSION.NUMBER' ||
          key === 'VERSION' || key.includes('版本') ||
          /version.*number/i.test(key) || /^version$/i.test(key)) {
          return String(value);
        }
        // 尝试从嵌套对象中获取
        if (typeof value === 'object' && value !== null) {
          const nestedValue = (value as any).number;
          if (nestedValue !== undefined) {
            return String(nestedValue);
          }
        }
      }
    }
    // 对于 position_value 和 total_assets，尝试从嵌套路径获取
    if (fieldName === 'position_value') {
      const positions = businessData.positions || businessData.POSITIONS;
      if (positions && typeof positions === 'object') {
        const posValue = positions.value || positions.VALUE;
        if (posValue !== undefined) {
          const numValue = Number(posValue);
          if (!isNaN(numValue)) {
            return numValue.toFixed(2);
          }
          return String(posValue);
        }
      }
    }
    // 计算资产总额 = 仓位价值 + USDC余额
    if (fieldName === 'total_assets') {
      let positionValue = 0;
      let balance = 0;

      // 获取仓位价值
      const positions = businessData.positions || businessData.POSITIONS;
      if (positions && typeof positions === 'object') {
        const posValue = positions.value || positions.VALUE;
        if (posValue !== undefined) {
          const numValue = Number(posValue);
          if (!isNaN(numValue)) {
            positionValue = numValue;
          }
        }
      }
      // 如果没有从嵌套对象获取到，尝试从其他字段获取
      if (positionValue === 0) {
        for (const [key, value] of Object.entries(businessData)) {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'positions.value' || lowerKey === 'position.value' ||
            key === 'positions.value' || key === 'POSITIONS.VALUE' ||
            key === 'position.value' || key === 'POSITION.VALUE' ||
            (key.includes('仓位') && key.includes('价值')) ||
            (key.includes('持仓') && key.includes('价值')) ||
            /position.*value/i.test(key)) {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              positionValue = numValue;
              break;
            }
          }
        }
      }

      // 获取USDC余额
      for (const [key, value] of Object.entries(businessData)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'usdc_balance' || lowerKey === 'wallet.usdc_balance' ||
          key === 'WALLET.USDC_BALANCE') {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            balance = numValue;
            break;
          }
        }
        // 匹配包含 usdc 和 balance 的字段（排除 pol_balance）
        if ((/usdc.*balance/i.test(key) || /balance.*usdc/i.test(key)) &&
          !/pol.*balance/i.test(key) && !/balance.*pol/i.test(key)) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            balance = numValue;
            break;
          }
        }
      }

      // 计算资产总额
      const totalAssets = positionValue + balance;
      if (totalAssets > 0) {
        return totalAssets.toFixed(2);
      }
      return '-';
    }
    if (fieldName === 'version_number') {
      const version = businessData.version || businessData.VERSION;
      if (version && typeof version === 'object') {
        const verNumber = version.number || version.NUMBER;
        if (verNumber !== undefined) {
          return String(verNumber);
        }
      }
      // 如果 version 是字符串，直接返回
      if (businessData.version && typeof businessData.version === 'string') {
        return businessData.version;
      }
    }
    return '-';
  };


  // 过滤和排序状态列表
  // 后端总返回 secrets 全集；前端做搜索 / 排序 / 在线时间口径筛选
  const filteredAndSortedStatuses = React.useMemo(() => {
    let filtered = statuses;

    // 全局搜索过滤（搜索所有字段，包括业务数据）
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filtered = filtered.filter((status) => {
        // 搜索基本字段
        const basicMatch = (
          (status.key_name && status.key_name.toLowerCase().includes(keyword)) ||
          (status.ip && status.ip.toLowerCase().includes(keyword)) ||
          (status.proxy_address && status.proxy_address.toLowerCase().includes(keyword)) ||
          (status.wallet_type && status.wallet_type.toLowerCase().includes(keyword)) ||
          (status.status && status.status.toLowerCase().includes(keyword)) ||
          (status.error_msg && status.error_msg.toLowerCase().includes(keyword)) ||
          (status.response_time && String(status.response_time).includes(keyword)) ||
          (status.status_code && String(status.status_code).includes(keyword))
        );

        // 搜索业务数据
        let businessMatch = false;
        if (status.data) {
          try {
            const businessData = JSON.parse(status.data);
            const dataStr = JSON.stringify(businessData).toLowerCase();
            businessMatch = dataStr.includes(keyword);
          } catch {
            // 如果解析失败，直接搜索原始字符串
            businessMatch = status.data.toLowerCase().includes(keyword);
          }
        }

        return basicMatch || businessMatch;
      });
    }

    // 按指定字段排序
    const getMergedDataForSort = (s: WorkerStatusType) => {
      const staticInfo = parseInfoData(s.info_data) || {};
      const dynamicData = s.data ? parseBusinessData(s.data) : null;
      return { ...staticInfo, ...(dynamicData || {}) };
    };

    // 按字母部分优先、数字部分次级进行 key_name 排序（自然排序）
    const compareKeyName = (nameA: string, nameB: string): number => {
      const extractParts = (value: string) => {
        const normalized = value.toLowerCase().trim();
        const alphaPart = normalized.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
        const numberParts = (normalized.match(/\d+/g) || []).map(Number);
        return { alphaPart, numberParts };
      };

      const partsA = extractParts(nameA);
      const partsB = extractParts(nameB);

      const alphaCompare = partsA.alphaPart.localeCompare(partsB.alphaPart, 'zh-CN');
      if (alphaCompare !== 0) return alphaCompare;

      const maxLen = Math.max(partsA.numberParts.length, partsB.numberParts.length);
      for (let i = 0; i < maxLen; i += 1) {
        const numA = partsA.numberParts[i];
        const numB = partsB.numberParts[i];
        if (numA === undefined && numB === undefined) break;
        if (numA === undefined) return -1;
        if (numB === undefined) return 1;
        if (numA !== numB) return numA - numB;
      }

      return nameA.toLowerCase().localeCompare(nameB.toLowerCase(), 'zh-CN');
    };

    const sorted = [...filtered].sort((a, b) => {
      let valueA: any = '';
      let valueB: any = '';

      switch (sortField) {
        case 'ip':
          valueA = (a.ip || '').toLowerCase();
          valueB = (b.ip || '').toLowerCase();
          break;
        case 'key_name':
          valueA = a.key_name || '';
          valueB = b.key_name || '';
          return sortOrder === 'asc'
            ? compareKeyName(valueA, valueB)
            : compareKeyName(valueB, valueA);
        case 'proxy_address':
          valueA = (a.proxy_address || '').toLowerCase();
          valueB = (b.proxy_address || '').toLowerCase();
          break;
        case 'wallet_type':
          valueA = (a.wallet_type || '').toLowerCase();
          valueB = (b.wallet_type || '').toLowerCase();
          break;
        case 'created_at':
          valueA = a.created_at ? new Date(a.created_at).getTime() : 0;
          valueB = b.created_at ? new Date(b.created_at).getTime() : 0;
          break;
        case 'status':
          valueA = (a.status || '').toLowerCase();
          valueB = (b.status || '').toLowerCase();
          break;
        case 'response_time':
          valueA = a.response_time ?? 0;
          valueB = b.response_time ?? 0;
          break;
        case 'status_code':
          valueA = a.status_code ?? 0;
          valueB = b.status_code ?? 0;
          break;
        case 'error_msg':
          valueA = (a.error_msg || '').toLowerCase();
          valueB = (b.error_msg || '').toLowerCase();
          break;
        case 'checked_at':
          valueA = a.checked_at ? new Date(a.checked_at).getTime() : 0;
          valueB = b.checked_at ? new Date(b.checked_at).getTime() : 0;
          break;
        case 'position_count':
        case 'order_count':
        case 'tail_order_share':
        case 'balance':
        case 'total_assets':
        case 'version_number': {
          const strA = getKeyMetricValue(getMergedDataForSort(a), sortField);
          const strB = getKeyMetricValue(getMergedDataForSort(b), sortField);
          const numA = strA === '-' ? NaN : Number(strA);
          const numB = strB === '-' ? NaN : Number(strB);
          valueA = !Number.isNaN(numA) ? numA : (strA === '-' ? '' : strA.toLowerCase());
          valueB = !Number.isNaN(numB) ? numB : (strB === '-' ? '' : strB.toLowerCase());
          break;
        }
        default:
          valueA = (a.ip || '').toLowerCase();
          valueB = (b.ip || '').toLowerCase();
      }

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        if (sortOrder === 'asc') {
          return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
        }
        return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        if (sortOrder === 'asc') {
          return valueA.localeCompare(valueB, 'zh-CN');
        }
        return valueB.localeCompare(valueA, 'zh-CN');
      }
      // 数值与空/字符串混合：空或非数值排后（asc）或排前（desc）
      const emptyA = valueA === '' || valueA === undefined;
      const emptyB = valueB === '' || valueB === undefined;
      if (emptyA && emptyB) return 0;
      if (emptyA) return sortOrder === 'asc' ? 1 : -1;
      if (emptyB) return sortOrder === 'asc' ? -1 : 1;
      if (sortOrder === 'asc') {
        return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
      }
      return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
    });

    return sorted;
  }, [statuses, searchKeyword, sortField, sortOrder]);

  // 搜索 / 排序 / 每页条数变化时回到第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, sortField, sortOrder, pageSize]);

  // 总页数；总数变化（数据增减）后若当前页超出，自动回到最后一页
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedStatuses.length / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // 当前页要展示的切片
  const pagedStatuses = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedStatuses.slice(start, start + pageSize);
  }, [filteredAndSortedStatuses, currentPage]);

  // 统计信息（基于过滤后的数据，合并静态info和动态status）
  const stats = React.useMemo(() => {
    let totalAssets = 0;
    let totalBalance = 0;

    filteredAndSortedStatuses.forEach((status) => {
      // 合并静态info和动态status数据
      const staticInfo = parseInfoData(status.info_data) || {};
      const dynamicData = status.data ? parseBusinessData(status.data) : null;
      const mergedData = {
        ...staticInfo,
        ...(dynamicData || {}),
      };

      if (Object.keys(mergedData).length > 0) {
        // 计算资产总额（仓位价值 + USDC余额）
        const assets = getKeyMetricValue(mergedData, 'total_assets');
        if (assets !== '-') {
          const numValue = Number(assets);
          if (!isNaN(numValue)) {
            totalAssets += numValue;
          }
        }

        // 计算总余额（用于单独显示）
        const balance = getKeyMetricValue(mergedData, 'balance');
        if (balance !== '-') {
          const numValue = Number(balance);
          if (!isNaN(numValue)) {
            totalBalance += numValue;
          }
        }
      }
    });

    return {
      total: filteredAndSortedStatuses.length,
      online: filteredAndSortedStatuses.filter((s) => isWorkerOnline(s)).length,
      // 根据检查时间判断离线（超过一分钟算离线）
      offline: filteredAndSortedStatuses.filter((s) => !isWorkerOnline(s)).length,
      error: 0, // error 已统一计入 offline，这里设为 0
      totalAssets,
      totalBalance,
    };
  }, [filteredAndSortedStatuses]);

  // 导出当前过滤后的表格数据（CSV）
  const handleExportFilteredData = () => {
    if (filteredAndSortedStatuses.length === 0) {
      showToast('当前没有可导出的数据', 'error');
      return;
    }

    const headers = selectedFields
      .map((fieldKey) => availableFields.find((f) => f.key === fieldKey))
      .filter((field): field is { key: string; label: string } => !!field);

    const getFieldValueForExport = (status: WorkerStatusType, fieldKey: string): string => {
      const staticInfo = parseInfoData(status.info_data) || {};
      const dynamicData = status.data ? parseBusinessData(status.data) : null;
      const mergedData = {
        ...staticInfo,
        ...(dynamicData || {}),
      };

      switch (fieldKey) {
        case 'ip':
          return status.ip || '-';
        case 'key_name':
          return status.key_name || '-';
        case 'proxy_address':
          return status.proxy_address || '-';
        case 'wallet_type':
          return status.wallet_type || '-';
        case 'status':
          return isWorkerOnline(status) ? '在线' : '离线';
        case 'response_time':
          return status.response_time !== undefined ? `${status.response_time}` : '-';
        case 'status_code':
          return status.status_code !== undefined ? `${status.status_code}` : '-';
        case 'error_msg':
          return status.error_msg || '-';
        case 'checked_at':
          return status.checked_at ? formatTime(status.checked_at) : '-';
        case 'created_at':
          return status.created_at ? formatTime(status.created_at) : '-';
        case 'position_count':
        case 'order_count':
        case 'tail_order_share':
        case 'balance':
        case 'total_assets':
          return getKeyMetricValue(mergedData, fieldKey);
        case 'version_number':
          return getKeyMetricValue(staticInfo, 'version_number');
        default:
          return '-';
      }
    };

    const escapeCsvValue = (value: string): string => {
      const normalized = value ?? '';
      if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
      }
      return normalized;
    };

    const csvHeaderLine = headers.map((h) => escapeCsvValue(h.label)).join(',');
    const csvDataLines = filteredAndSortedStatuses.map((status) => {
      const values = headers.map((h) => getFieldValueForExport(status, h.key));
      return values.map((v) => escapeCsvValue(v)).join(',');
    });
    const csvContent = [csvHeaderLine, ...csvDataLines].join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    link.href = url;
    link.download = `worker_status_filtered_${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    showToast(`导出成功，共 ${filteredAndSortedStatuses.length} 条数据`, 'success');
  };

  return (
    <div className="worker-status-container">
      <header className="worker-status-page-head" aria-label="工作机监控">
        <div className="worker-status-page-head-text">
          <h1 className="worker-status-title">工作机监控</h1>
          <p className="worker-status-subtitle">实时状态 · 业务信息 · 自动刷新可暂停</p>
        </div>
      </header>
      {/* 统计信息 - 横向布局放在最上面 */}
      <div className="stats-container-top">
        <div className="stat-item-top">
          <span className="stat-label">总数</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-item-top stat-online">
          <span className="stat-label">在线</span>
          <span className="stat-value">{stats.online}</span>
        </div>
        <div className="stat-item-top stat-offline">
          <span className="stat-label">离线</span>
          <span className="stat-value">{stats.offline}</span>
        </div>
        <div className="stat-item-top stat-divider">
          <span className="stat-label">总资产</span>
          <span className="stat-value">{stats.totalAssets.toFixed(2)}</span>
        </div>
        <div className="stat-item-top">
          <span className="stat-label">总余额</span>
          <span className="stat-value">{stats.totalBalance.toFixed(2)}</span>
        </div>
      </div>

      <div className="main-layout">
        {/* 主内容区域 - 表格 */}
        <div className="main-content">
          {error && <div className="error-message">{error}</div>}

          {/* Toast 提示 */}
          {toast && (
            <div className={`toast toast-${toast.type}`}>
              {toast.message}
            </div>
          )}

          {loading && statuses.length === 0 ? (
            <div className="loading-wrap" role="status" aria-live="polite">
              <Spin size="large" tip="加载工作机数据…" />
            </div>
          ) : (
            <div className="table-container">
              {/* 搜索框与控制按钮 - 放在表头上方 */}
              <div className="search-box-above-table">
                <div className="search-box-left">
                  <input
                    type="text"
                    placeholder="全局搜索（所有字段）..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="search-input"
                  />
                  {searchKeyword && (
                    <button
                      className="clear-search-button"
                      onClick={() => setSearchKeyword('')}
                      title="清除搜索"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="search-box-right">
                  <button
                    type="button"
                    className="toggle-button"
                    onClick={() => loadStatuses()}
                    disabled={loading}
                    title="立即刷新列表"
                  >
                    <ReloadOutlined spin={loading} /> 刷新
                  </button>
                  <button
                    className="toggle-button"
                    onClick={handleExportFilteredData}
                    title="导出当前过滤结果"
                  >
                    <DownloadOutlined /> 导出过滤结果
                  </button>
                  <button
                    className="toggle-button"
                    onClick={() => setAutoRefresh((prev) => !prev)}
                    title={autoRefresh ? '暂停自动刷新' : '恢复自动刷新'}
                  >
                    {autoRefresh ? '自动刷新: 开' : '自动刷新: 关'}
                  </button>
                </div>
              </div>
              {filteredAndSortedStatuses.length === 0 ? (
                <div className="empty-message">
                  {searchKeyword ? '没有找到匹配的工作机' : '暂无工作机状态数据'}
                </div>
              ) : (
                <table className="worker-status-table">
                  <thead>
                    <tr>
                      {selectedFields.includes('ip') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'ip') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('ip');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          IP地址
                          {sortField === 'ip' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('key_name') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'key_name') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('key_name');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          密钥名称
                          {sortField === 'key_name' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('proxy_address') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'proxy_address') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('proxy_address');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          代理地址
                          {sortField === 'proxy_address' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('wallet_type') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'wallet_type') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('wallet_type');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          钱包类型
                          {sortField === 'wallet_type' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('created_at') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'created_at') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('created_at');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          创建时间
                          {sortField === 'created_at' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('status') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'status') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('status');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          状态
                          {sortField === 'status' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('response_time') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'response_time') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('response_time');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          响应时间(ms)
                          {sortField === 'response_time' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('status_code') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'status_code') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('status_code');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          HTTP状态码
                          {sortField === 'status_code' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('error_msg') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'error_msg') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('error_msg');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          错误信息
                          {sortField === 'error_msg' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('checked_at') && (
                        <th
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'checked_at') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('checked_at');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          检查时间
                          {sortField === 'checked_at' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('position_count') && (
                        <th
                          className="key-metric-header sortable-header"
                          onClick={() => {
                            if (sortField === 'position_count') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('position_count');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          持仓数
                          {sortField === 'position_count' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('order_count') && (
                        <th
                          className="key-metric-header sortable-header"
                          onClick={() => {
                            if (sortField === 'order_count') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('order_count');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          挂单数
                          {sortField === 'order_count' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('tail_order_share') && (
                        <th
                          className="key-metric-header sortable-header"
                          onClick={() => {
                            if (sortField === 'tail_order_share') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('tail_order_share');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          尾盘下注份额
                          {sortField === 'tail_order_share' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('balance') && (
                        <th
                          className="key-metric-header sortable-header"
                          onClick={() => {
                            if (sortField === 'balance') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('balance');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          USDC余额
                          {sortField === 'balance' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('total_assets') && (
                        <th
                          className="key-metric-header sortable-header"
                          onClick={() => {
                            if (sortField === 'total_assets') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('total_assets');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          资产总额
                          {sortField === 'total_assets' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                      {selectedFields.includes('version_number') && (
                        <th
                          className="key-metric-header sortable-header"
                          onClick={() => {
                            if (sortField === 'version_number') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('version_number');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          程序版本号
                          {sortField === 'version_number' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStatuses.map((status) => {
                      // 合并静态info数据和动态status数据
                      const staticInfo = parseInfoData(status.info_data) || {};
                      const dynamicData = status.data ? parseBusinessData(status.data) : null;

                      // 合并数据：静态info优先，动态status数据补充
                      const mergedData = {
                        ...staticInfo,
                        ...(dynamicData || {}),
                      };

                      // 调试：记录数据解析情况（仅在开发环境）
                      if (import.meta.env.DEV && status.ip) {
                        if (Object.keys(staticInfo).length === 0 && Object.keys(dynamicData || {}).length === 0) {
                          console.debug(`[WorkerStatus] ${status.ip}: info_data=${status.info_data?.substring(0, 100)}, data=${status.data?.substring(0, 100)}`);
                        }
                      }

                      const nestedProxyWallet = getProxyWalletAddress(status.info_data, status.data);
                      // 使用IP作为key，确保唯一性
                      return (
                        <React.Fragment key={status.ip || status.id}>
                          <tr>
                            {selectedFields.includes('ip') && (
                              <td>
                                <span>{status.ip}</span>
                              </td>
                            )}
                            {selectedFields.includes('key_name') && (
                              <td>
                                {status.key_name ? <Tag color="blue">{status.key_name}</Tag> : <span style={{ color: '#999' }}>-</span>}
                              </td>
                            )}
                            {selectedFields.includes('proxy_address') && (
                              <td>
                                <Space size="small" wrap>
                                  {status.proxy_address ? (
                                    <Tooltip title={`${status.proxy_address}（点击复制完整地址）`}>
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        style={{
                                          cursor: 'pointer',
                                          color: '#1890ff',
                                          textDecoration: 'underline',
                                          fontFamily: 'monospace',
                                        }}
                                        onClick={async () => {
                                          try {
                                            await navigator.clipboard.writeText(status.proxy_address!);
                                            showToast('代理地址已复制到剪贴板', 'success');
                                          } catch (err) {
                                            secureLog.error('复制失败:', err);
                                            const textArea = document.createElement('textarea');
                                            textArea.value = status.proxy_address!;
                                            textArea.style.position = 'fixed';
                                            textArea.style.opacity = '0';
                                            document.body.appendChild(textArea);
                                            textArea.select();
                                            try {
                                              document.execCommand('copy');
                                              showToast('代理地址已复制到剪贴板', 'success');
                                            } catch (e) {
                                              showToast('复制失败，请手动复制', 'error');
                                            }
                                            document.body.removeChild(textArea);
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            (e.currentTarget as HTMLElement).click();
                                          }
                                        }}
                                      >
                                        {abbreviateProxyAddressForDisplay(status.proxy_address)}
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    <span style={{ color: '#999' }}>-</span>
                                  )}
                                  {nestedProxyWallet &&
                                    nestedProxyWallet !== (status.proxy_address || '').trim() && (
                                      <Tooltip title={`复制解析出的代理钱包地址: ${nestedProxyWallet}`}>
                                        <Button
                                          type="text"
                                          size="small"
                                          icon={<CopyOutlined />}
                                          onClick={async () => {
                                            try {
                                              await navigator.clipboard.writeText(nestedProxyWallet);
                                              showToast('代理钱包地址已复制到剪贴板');
                                            } catch (err) {
                                              secureLog.error('复制失败:', err);
                                              const textArea = document.createElement('textarea');
                                              textArea.value = nestedProxyWallet;
                                              textArea.style.position = 'fixed';
                                              textArea.style.opacity = '0';
                                              document.body.appendChild(textArea);
                                              textArea.select();
                                              try {
                                                document.execCommand('copy');
                                                showToast('代理钱包地址已复制到剪贴板');
                                              } catch (e) {
                                                showToast('复制失败，请手动复制', 'error');
                                              }
                                              document.body.removeChild(textArea);
                                            }
                                          }}
                                        />
                                      </Tooltip>
                                    )}
                                </Space>
                              </td>
                            )}
                            {selectedFields.includes('wallet_type') && (
                              <td>{status.wallet_type || '-'}</td>
                            )}
                            {selectedFields.includes('status') && (
                              <td>
                                {(() => {
                                  // 根据检查时间判断是否在线（超过一分钟算离线）
                                  const isOnline = isWorkerOnline(status);
                                  const displayStatus = isOnline ? 'online' : 'offline';
                                  return (
                                    <span className={`status-badge status-${displayStatus}`}>
                                      {isOnline ? '在线' : '离线'}
                                    </span>
                                  );
                                })()}
                              </td>
                            )}
                            {selectedFields.includes('response_time') && (
                              <td>{status.response_time !== undefined ? `${status.response_time}ms` : '-'}</td>
                            )}
                            {selectedFields.includes('status_code') && (
                              <td>{status.status_code !== undefined ? status.status_code : '-'}</td>
                            )}
                            {selectedFields.includes('error_msg') && (
                              <td>
                                {status.error_msg ? (
                                  <Tooltip title={status.error_msg}>
                                    <span style={{ color: '#ff4d4f', maxWidth: '200px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {status.error_msg}
                                    </span>
                                  </Tooltip>
                                ) : (
                                  '-'
                                )}
                              </td>
                            )}
                            {selectedFields.includes('checked_at') && (
                              <td>{status.checked_at ? formatTime(status.checked_at) : '-'}</td>
                            )}
                            {selectedFields.includes('created_at') && (
                              <td>{formatTime(status.created_at)}</td>
                            )}
                            {selectedFields.includes('position_count') && (
                              <td className="key-metric-cell">
                                {getKeyMetricValue(mergedData, 'position_count')}
                              </td>
                            )}
                            {selectedFields.includes('order_count') && (
                              <td className="key-metric-cell">
                                {getKeyMetricValue(mergedData, 'order_count')}
                              </td>
                            )}
                            {selectedFields.includes('tail_order_share') && (
                              <td className="key-metric-cell">
                                {status.tail_order_share ?? '-'}
                              </td>
                            )}
                            {selectedFields.includes('balance') && (
                              <td className="key-metric-cell">
                                {getKeyMetricValue(mergedData, 'balance')}
                              </td>
                            )}
                            {selectedFields.includes('total_assets') && (
                              <td className="key-metric-cell">
                                {getKeyMetricValue(mergedData, 'total_assets')}
                              </td>
                            )}
                            {selectedFields.includes('version_number') && (
                              <td className="key-metric-cell">
                                {/* version_number 只从 info_data（info接口）中获取，不从 status 接口获取 */}
                                {getKeyMetricValue(staticInfo, 'version_number')}
                              </td>
                            )}
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {filteredAndSortedStatuses.length > 0 && (
                <div className="pagination-bar" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 4px',
                  fontSize: 13,
                  color: '#666',
                  gap: 12,
                  flexWrap: 'wrap',
                }}>
                  <span>
                    共 {filteredAndSortedStatuses.length} 条 ·
                    第 {currentPage} / {totalPages} 页 ·
                    显示 {(currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, filteredAndSortedStatuses.length)}
                  </span>
                  <Space size="small" wrap>
                    <span>每页</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      style={{ padding: '2px 6px', fontSize: 13 }}
                    >
                      {[10, 20, 50, 100, 500].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <Button size="small" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>首页</Button>
                    <Button size="small" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>上一页</Button>
                    <Button size="small" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>下一页</Button>
                    <Button size="small" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>末页</Button>
                  </Space>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 侧边栏 */}
        <div className="sidebar">
          {/* 字段选择 */}
          <div className="sidebar-section">
            <h3 className="sidebar-title">显示字段</h3>
            <div className="field-selector-sidebar">
              {availableFields.map((field) => (
                <label key={field.key} className="field-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFields([...selectedFields, field.key]);
                      } else {
                        setSelectedFields(selectedFields.filter((f) => f !== field.key));
                      }
                    }}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

