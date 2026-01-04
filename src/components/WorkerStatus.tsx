import React, { useState, useEffect } from 'react';
import { workersAPI, WorkerStatus as WorkerStatusType } from '../utils/api';
import { isProductionEnvironment } from '../utils/env';
import { secureLog } from '../utils/security';
import './WorkerStatus.css';

export default function WorkerStatus() {
  const [statuses, setStatuses] = useState<WorkerStatusType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'key_name',
    'ip',
    'server_name',
    'status',
    'response_time',
    'checked_at',
    'position_count',
    'order_count',
    'balance',
    'position_value',
    'version_number',
  ]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5); // 秒
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set()); // 展开的行ID
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>(''); // 搜索关键词
  const [sortField, setSortField] = useState<string>('server_name'); // 排序字段
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // 排序顺序
  const [hideOffline, setHideOffline] = useState<boolean>(false); // 隐藏离线机器
  const [selectedFile, setSelectedFile] = useState<File | null>(null); // 选定的文件
  const [uploading, setUploading] = useState<Set<string>>(new Set()); // 正在上传的工作机IP集合

  // 可选的字段列表
  const availableFields = [
    { key: 'key_name', label: '密钥名称' },
    { key: 'ip', label: 'IP地址' },
    { key: 'server_name', label: '服务器名称' },
    { key: 'status', label: '状态' },
    { key: 'response_time', label: '响应时间(ms)' },
    { key: 'status_code', label: 'HTTP状态码' },
    { key: 'error_msg', label: '错误信息' },
    { key: 'checked_at', label: '检查时间' },
    { key: 'position_count', label: '持仓数' },
    { key: 'order_count', label: '挂单数' },
    { key: 'balance', label: 'USDC余额' },
    { key: 'position_value', label: '仓位价值' },
    { key: 'version_number', label: '程序版本号' },
  ];

  // 加载工作机状态
  const loadStatuses = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await workersAPI.getWorkerStatuses();
      secureLog.log('加载工作机状态响应:', response);
      if (response && response.statuses) {
        // 按IP去重，保留最新的状态（如果有多个相同IP，保留checked_at最新的）
        const statusMap = new Map<string, WorkerStatusType>();
        response.statuses.forEach((status) => {
          const existing = statusMap.get(status.ip);
          if (!existing) {
            statusMap.set(status.ip, status);
          } else {
            // 比较检查时间，保留最新的
            const existingTime = existing.checked_at ? new Date(existing.checked_at).getTime() : 0;
            const currentTime = status.checked_at ? new Date(status.checked_at).getTime() : 0;
            if (currentTime > existingTime) {
              statusMap.set(status.ip, status);
            }
          }
        });
        
        // 转换为数组
        const uniqueStatuses = Array.from(statusMap.values());
        setStatuses(uniqueStatuses);
        secureLog.log('去重前数量:', response.statuses.length, '去重后数量:', uniqueStatuses.length);
      } else {
        secureLog.warn('响应数据格式异常:', response);
        setStatuses([]);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || '加载工作机状态失败';
      setError(errorMsg);
      secureLog.error('加载工作机状态失败:', err);
      setStatuses([]);
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

  // 手动检查指定工作机状态
  const handleCheckStatus = async (ip: string) => {
    try {
      await workersAPI.checkWorkerStatus(ip);
      // 重新加载状态
      await loadStatuses();
      showToast('检查完成', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || err.message || '检查工作机状态失败', 'error');
    }
  };

  // 上传文件到指定工作机（支持并发）
  const handleUploadFile = async (ip: string) => {
    if (!selectedFile) {
      showToast('请先选择要上传的文件', 'error');
      return;
    }

    // 检查文件扩展名
    if (!selectedFile.name.toLowerCase().endsWith('.exe')) {
      const confirmed = window.confirm(`文件不是.exe格式: ${selectedFile.name}\n是否继续上传?`);
      if (!confirmed) {
        return;
      }
    }

    // 如果已经在上传中，直接返回
    if (uploading.has(ip)) {
      return;
    }

    // 添加到上传集合
    setUploading(prev => new Set(prev).add(ip));

    try {
      const fileSizeMB = selectedFile.size / (1024 * 1024);
      const timeout = Math.max(60, Math.ceil(fileSizeMB * 10)); // 每MB 10秒

      const formData = new FormData();
      formData.append('file', selectedFile);

      // 生产环境使用HTTPS，开发环境使用HTTP（工作机可能不支持HTTPS）
      // 注意：生产环境建议工作机也配置HTTPS
      const protocol = isProductionEnvironment() ? 'https' : 'http';
      const url = `${protocol}://${ip}:8001/update`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        showToast(`${ip}: 文件上传成功! ${result.message || ''}`, 'success');
        // 重新加载状态
        await loadStatuses();
      } else if (response.status === 403) {
        const error = await response.json().catch(() => ({ error: 'Access denied' }));
        showToast(`${ip}: 访问被拒绝 - ${error.error || '请检查IP是否在白名单中'}`, 'error');
      } else if (response.status === 502) {
        showToast(`${ip}: 上传失败 - 服务器守护进程可能未运行或已崩溃`, 'error');
      } else {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        showToast(`${ip}: 上传失败 - ${error.error || response.statusText}`, 'error');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        showToast(`${ip}: 上传超时，请检查网络连接或文件大小`, 'error');
      } else {
        showToast(`${ip}: 上传失败 - ${err.message || '未知错误'}`, 'error');
      }
      secureLog.error(`上传文件到 ${ip} 失败:`, err);
    } finally {
      // 从上传集合中移除
      setUploading(prev => {
        const newSet = new Set(prev);
        newSet.delete(ip);
        return newSet;
      });
    }
  };

  // 初始加载
  useEffect(() => {
    loadStatuses();
  }, []);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadStatuses();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // 格式化状态显示
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      online: { label: '在线', className: 'status-online' },
      offline: { label: '离线', className: 'status-offline' },
      error: { label: '错误', className: 'status-error' },
    };

    const statusInfo = statusMap[status] || { label: status, className: 'status-unknown' };
    return <span className={`status-badge ${statusInfo.className}`}>{statusInfo.label}</span>;
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
  const getProxyWalletAddress = (dataStr: string | undefined): string | null => {
    if (!dataStr) return null;
    const businessData = parseBusinessData(dataStr);
    if (!businessData) return null;
    
    // 查找代理钱包地址字段（支持多种命名）
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
    return null;
  };

  // 从业务数据中提取关键字段值
  const getKeyMetricValue = (dataStr: string | undefined, fieldName: string): string => {
    if (!dataStr) return '-';
    const businessData = parseBusinessData(dataStr);
    if (!businessData) return '-';
    
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
    // 对于 position_value 和 version_number，尝试从嵌套路径获取
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

  // 切换行展开状态
  const toggleRowExpansion = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // 渲染业务数据
  const renderBusinessData = (data: Record<string, any>) => {
    // 关键字段匹配规则（持仓数、挂单数、余额）
    const isKeyField = (key: string): boolean => {
      const lowerKey = key.toLowerCase();
      // 优先精确匹配 usdc_balance（不区分大小写，支持 WALLET.USDC_BALANCE）
      if (lowerKey === 'usdc_balance' || lowerKey === 'wallet.usdc_balance' || 
          key === 'WALLET.USDC_BALANCE') {
        return true;
      }
      // 中文匹配持仓和挂单
      if (key.includes('持仓') || key.includes('挂单')) {
        return true;
      }
      // 英文匹配持仓和挂单
      if (/position.*count/i.test(key) || /positions/i.test(key) || 
          /order.*count/i.test(key) || /orders/i.test(key)) {
        return true;
      }
      // 匹配包含 usdc 和 balance 的字段（排除 pol_balance）
      if ((/usdc.*balance/i.test(key) || /balance.*usdc/i.test(key)) && 
          !/pol.*balance/i.test(key) && !/balance.*pol/i.test(key)) {
        return true;
      }
      return false;
    };
    
    // 重要字段匹配规则（系统状态相关）
    const isImportantField = (key: string): boolean => {
      const importantPatterns = [
        /cpu/i, /memory/i, /disk/i, /network/i,
        /uptime/i, /version/i, /status/i, /运行时间/i,
        /版本/i, /状态/i, /最后更新/i, /last.*update/i
      ];
      return importantPatterns.some(pattern => pattern.test(key));
    };
    
    // 分离关键字段、重要字段和其他字段
    const keyItems: Array<[string, any]> = [];
    const importantItems: Array<[string, any]> = [];
    const otherItems: Array<[string, any]> = [];
    
    Object.entries(data).forEach(([key, value]) => {
      if (isKeyField(key)) {
        keyItems.push([key, value]);
      } else if (isImportantField(key)) {
        importantItems.push([key, value]);
      } else {
        otherItems.push([key, value]);
      }
    });
    
    // 格式化值
    const formatValue = (value: any, key?: string): string => {
      if (value === null || value === undefined) return '-';
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      // 如果是余额相关字段，格式化为两位小数（只匹配 usdc_balance，排除 pol_balance）
      if (key) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'usdc_balance' || lowerKey === 'wallet.usdc_balance' || 
            key === 'WALLET.USDC_BALANCE' ||
            ((/usdc.*balance/i.test(key) || /balance.*usdc/i.test(key)) && 
             !/pol.*balance/i.test(key) && !/balance.*pol/i.test(key))) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            return numValue.toFixed(2);
          }
        }
      }
      return String(value);
    };
    
    return (
      <div className="business-data-container">
        {/* 关键业务指标 */}
        {keyItems.length > 0 && (
          <div className="business-data-section">
            <h5 className="section-title">关键业务指标（持仓数、挂单数、USDC余额）</h5>
            <div className="business-data key-metrics">
              {keyItems.map(([key, value]) => (
                <div key={key} className="business-data-item key-metric">
                  <span className="business-data-key">{key}:</span>
                  <span className="business-data-value key-value">
                    {formatValue(value, key)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 系统状态 */}
        {importantItems.length > 0 && (
          <div className="business-data-section">
            <h5 className="section-title">系统状态</h5>
            <div className="business-data">
              {importantItems.map(([key, value]) => (
                <div key={key} className="business-data-item">
                  <span className="business-data-key">{key}:</span>
                  <span className="business-data-value">
                    {formatValue(value, key)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 其他信息 */}
        {otherItems.length > 0 && (
          <div className="business-data-section">
            <h5 className="section-title">其他信息</h5>
            <div className="business-data">
              {otherItems.map(([key, value]) => (
                <div key={key} className="business-data-item">
                  <span className="business-data-key">{key}:</span>
                  <span className="business-data-value">
                    {formatValue(value, key)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 过滤和排序状态列表
  const filteredAndSortedStatuses = React.useMemo(() => {
    let filtered = statuses;
    
    // 隐藏离线机器
    if (hideOffline) {
      filtered = filtered.filter((status) => status.status !== 'offline');
    }
    
    // 全局搜索过滤（搜索所有字段，包括业务数据）
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filtered = filtered.filter((status) => {
        // 搜索基本字段
        const basicMatch = (
          (status.key_name && status.key_name.toLowerCase().includes(keyword)) ||
          (status.ip && status.ip.toLowerCase().includes(keyword)) ||
          (status.server_name && status.server_name.toLowerCase().includes(keyword)) ||
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
    const sorted = [...filtered].sort((a, b) => {
      let valueA: any = '';
      let valueB: any = '';
      
      switch (sortField) {
        case 'key_name':
          valueA = (a.key_name || '').toLowerCase();
          valueB = (b.key_name || '').toLowerCase();
          break;
        case 'ip':
          valueA = (a.ip || '').toLowerCase();
          valueB = (b.ip || '').toLowerCase();
          break;
        case 'server_name':
          valueA = (a.server_name || a.key_name || '').toLowerCase();
          valueB = (b.server_name || b.key_name || '').toLowerCase();
          break;
        case 'status':
          valueA = (a.status || '').toLowerCase();
          valueB = (b.status || '').toLowerCase();
          break;
        case 'response_time':
          valueA = a.response_time || 0;
          valueB = b.response_time || 0;
          break;
        case 'checked_at':
          valueA = a.checked_at ? new Date(a.checked_at).getTime() : 0;
          valueB = b.checked_at ? new Date(b.checked_at).getTime() : 0;
          break;
        default:
          valueA = (a.server_name || a.key_name || '').toLowerCase();
          valueB = (b.server_name || b.key_name || '').toLowerCase();
      }
      
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        if (sortOrder === 'asc') {
          return valueA.localeCompare(valueB, 'zh-CN');
        } else {
          return valueB.localeCompare(valueA, 'zh-CN');
        }
      } else {
        if (sortOrder === 'asc') {
          return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
        } else {
          return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
        }
      }
    });
    
    return sorted;
  }, [statuses, searchKeyword, sortField, sortOrder, hideOffline]);

  // 统计信息（基于过滤后的数据）
  const stats = React.useMemo(() => {
    let totalPositionValue = 0;
    let totalBalance = 0;
    
    filteredAndSortedStatuses.forEach((status) => {
      if (status.data) {
        const businessData = parseBusinessData(status.data);
        if (businessData) {
          // 计算总仓位价值
          const positionValue = getKeyMetricValue(status.data, 'position_value');
          if (positionValue !== '-') {
            const numValue = Number(positionValue);
            if (!isNaN(numValue)) {
              totalPositionValue += numValue;
            }
          }
          
          // 计算总余额
          const balance = getKeyMetricValue(status.data, 'balance');
          if (balance !== '-') {
            const numValue = Number(balance);
            if (!isNaN(numValue)) {
              totalBalance += numValue;
            }
          }
        }
      }
    });
    
    return {
      total: filteredAndSortedStatuses.length,
      online: filteredAndSortedStatuses.filter((s) => s.status === 'online').length,
      offline: filteredAndSortedStatuses.filter((s) => s.status === 'offline').length,
      error: filteredAndSortedStatuses.filter((s) => s.status === 'error').length,
      totalPositionValue,
      totalBalance,
    };
  }, [filteredAndSortedStatuses]);

  return (
    <div className="worker-status-container">
      <div className="worker-status-header">
        <h2>工作机状态监控</h2>
        <div className="header-controls">
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            自动刷新
          </label>
          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
            >
              <option value="5">5秒</option>
              <option value="10">10秒</option>
              <option value="30">30秒</option>
              <option value="60">60秒</option>
            </select>
          )}
          <button onClick={loadStatuses} disabled={loading}>
            {loading ? '加载中...' : '刷新'}
          </button>
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
            <div className="loading">加载中...</div>
          ) : (
            <div className="table-container">
              {/* 搜索框 - 放在表头上方 */}
              <div className="search-box-above-table">
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
              {filteredAndSortedStatuses.length === 0 ? (
                <div className="empty-message">
                  {searchKeyword ? '没有找到匹配的工作机' : '暂无工作机状态数据'}
                </div>
              ) : (
                <table className="worker-status-table">
                  <thead>
                    <tr>
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
                      {selectedFields.includes('server_name') && (
                        <th 
                          className="sortable-header"
                          onClick={() => {
                            if (sortField === 'server_name') {
                              setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setSortField('server_name');
                              setSortOrder('asc');
                            }
                          }}
                        >
                          服务器名称
                          {sortField === 'server_name' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
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
                      {selectedFields.includes('status_code') && <th>HTTP状态码</th>}
                      {selectedFields.includes('error_msg') && <th>错误信息</th>}
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
                      {selectedFields.includes('position_count') && <th className="key-metric-header">持仓数</th>}
                      {selectedFields.includes('order_count') && <th className="key-metric-header">挂单数</th>}
                      {selectedFields.includes('balance') && <th className="key-metric-header">USDC余额</th>}
                      {selectedFields.includes('position_value') && <th className="key-metric-header">仓位价值</th>}
                      {selectedFields.includes('version_number') && <th className="key-metric-header">程序版本号</th>}
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedStatuses.map((status) => {
                    const businessData = parseBusinessData(status.data);
                    const isExpanded = expandedRows.has(status.id);
                    const colSpan = selectedFields.length + 1; // +1 for 操作列
                    // 使用IP作为key，确保唯一性
                    return (
                      <React.Fragment key={status.ip || status.id}>
                        <tr>
                          {selectedFields.includes('key_name') && <td>{status.key_name}</td>}
                          {selectedFields.includes('ip') && <td>{status.ip}</td>}
                          {selectedFields.includes('server_name') && <td>{status.server_name || '-'}</td>}
                          {selectedFields.includes('status') && <td>{getStatusBadge(status.status)}</td>}
                          {selectedFields.includes('response_time') && (
                            <td>{status.response_time || '-'}</td>
                          )}
                          {selectedFields.includes('status_code') && (
                            <td>{status.status_code || '-'}</td>
                          )}
                          {selectedFields.includes('error_msg') && (
                            <td className="error-cell">{status.error_msg || '-'}</td>
                          )}
                          {selectedFields.includes('checked_at') && (
                            <td>{formatTime(status.checked_at)}</td>
                          )}
                          {selectedFields.includes('position_count') && (
                            <td className="key-metric-cell">
                              {getKeyMetricValue(status.data, 'position_count')}
                            </td>
                          )}
                          {selectedFields.includes('order_count') && (
                            <td className="key-metric-cell">
                              {getKeyMetricValue(status.data, 'order_count')}
                            </td>
                          )}
                          {selectedFields.includes('balance') && (
                            <td className="key-metric-cell">
                              {getKeyMetricValue(status.data, 'balance')}
                            </td>
                          )}
                          {selectedFields.includes('position_value') && (
                            <td className="key-metric-cell">
                              {getKeyMetricValue(status.data, 'position_value')}
                            </td>
                          )}
                          {selectedFields.includes('version_number') && (
                            <td className="key-metric-cell">
                              {getKeyMetricValue(status.data, 'version_number')}
                            </td>
                          )}
                          <td>
                            <div className="action-buttons">
                              {businessData && (
                                <button
                                  className="detail-button"
                                  onClick={() => toggleRowExpansion(status.id)}
                                  title={isExpanded ? '收起详情' : '查看详情'}
                                >
                                  {isExpanded ? '▼' : '▶'}
                                </button>
                              )}
                              {(() => {
                                const proxyAddress = getProxyWalletAddress(status.data);
                                return proxyAddress ? (
                                  <button
                                    className="copy-button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(proxyAddress);
                                        showToast('代理钱包地址已复制到剪贴板');
                                      } catch (err) {
                                        secureLog.error('复制失败:', err);
                                        // 降级方案：使用传统方法
                                        const textArea = document.createElement('textarea');
                                        textArea.value = proxyAddress;
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
                                    title={`复制代理钱包地址: ${proxyAddress}`}
                                  >
                                    📋
                                  </button>
                                ) : null;
                              })()}
                              {selectedFile && (
                                <button
                                  className="upload-button"
                                  onClick={() => handleUploadFile(status.ip)}
                                  disabled={uploading.has(status.ip)}
                                  title={`上传文件到 ${status.ip}`}
                                >
                                  {uploading.has(status.ip) ? '上传中...' : '上传'}
                                </button>
                              )}
                              <button
                                className="check-button"
                                onClick={() => handleCheckStatus(status.ip)}
                              >
                                检查
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && businessData && (
                          <tr className="detail-row">
                            <td colSpan={colSpan} className="detail-cell">
                              <div className="detail-content">
                                <div className="detail-header">
                                  <h4>工作机业务信息</h4>
                                  <span className="detail-subtitle">{status.key_name} ({status.ip})</span>
                                </div>
                                {renderBusinessData(businessData)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* 侧边栏 */}
        <div className="sidebar">
          {/* 文件选择器 */}
          <div className="sidebar-section">
            <h3 className="sidebar-title">文件上传</h3>
            <div className="file-selector">
              <label className="file-select-label">
                <input
                  type="file"
                  accept=".exe"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                  }}
                  style={{ display: 'none' }}
                  id="file-input"
                />
                <span className="file-select-button">选择文件</span>
              </label>
              {selectedFile && (
                <div className="file-info">
                  <span className="file-name">{selectedFile.name}</span>
                  <span className="file-size">
                    ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                  <button
                    className="file-clear-button"
                    onClick={() => {
                      setSelectedFile(null);
                      const input = document.getElementById('file-input') as HTMLInputElement;
                      if (input) input.value = '';
                    }}
                    title="清除选择"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            {selectedFile && (
              <div className="file-upload-hint">
                <span>已选择文件，点击工作机操作列的"上传"按钮进行上传</span>
              </div>
            )}
          </div>

          {/* 统计信息 */}
          <div className="sidebar-section">
            <h3 className="sidebar-title">统计信息</h3>
            <div className="stats-container-sidebar">
              <div className="stat-item-sidebar">
                <span className="stat-label">总数:</span>
                <span className="stat-value">{stats.total}</span>
              </div>
              <div className="stat-item-sidebar stat-online">
                <span className="stat-label">在线:</span>
                <span className="stat-value">{stats.online}</span>
              </div>
              <div className="stat-item-sidebar stat-offline">
                <span className="stat-label">离线:</span>
                <span className="stat-value">{stats.offline}</span>
              </div>
              <div className="stat-item-sidebar stat-error">
                <span className="stat-label">错误:</span>
                <span className="stat-value">{stats.error}</span>
              </div>
              <div className="stat-item-sidebar" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #dee2e6' }}>
                <span className="stat-label">总仓位价值:</span>
                <span className="stat-value">{stats.totalPositionValue.toFixed(2)}</span>
              </div>
              <div className="stat-item-sidebar">
                <span className="stat-label">总余额:</span>
                <span className="stat-value">{stats.totalBalance.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* 过滤 */}
          <div className="sidebar-section">
            <h3 className="sidebar-title">过滤</h3>
            <div className="filter-control-sidebar">
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={hideOffline}
                  onChange={(e) => setHideOffline(e.target.checked)}
                />
                隐藏离线机器
              </label>
            </div>
          </div>

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

