import React, { useState, useEffect, useRef } from 'react';
import { Button, Space, Card, Descriptions, Tag, Typography, Tooltip } from 'antd';
import { ReloadOutlined, CopyOutlined, UploadOutlined, WalletOutlined, CheckCircleOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { workersAPI, ordersAPI, WorkerStatus as WorkerStatusType } from '../utils/api';
import { isProductionEnvironment } from '../utils/env';
import { secureLog } from '../utils/security';
import './WorkerStatus.css';

const { Text } = Typography;

export default function WorkerStatus() {
  const [statuses, setStatuses] = useState<WorkerStatusType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'ip',
    'server_name',
    'proxy_wallet',
    'status',
    'response_time',
    'checked_at',
    'position_count',
    'order_count',
    'balance',
    'total_assets',
    'version_number',
  ]);
  // 自动刷新功能（UI已隐藏，但功能仍在使用）
  const [autoRefresh] = useState(true);
  const [refreshInterval] = useState(10); // 秒
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set()); // 展开的行ID
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>(''); // 搜索关键词
  const [sortField, setSortField] = useState<string>('server_name'); // 排序字段
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // 排序顺序
  const [hideOffline, setHideOffline] = useState<boolean>(true); // 隐藏离线机器，默认隐藏
  const [selectedFile, setSelectedFile] = useState<File | null>(null); // 选定的文件
  const [uploading, setUploading] = useState<Set<string>>(new Set()); // 正在上传的工作机IP集合
  const [positionsData, setPositionsData] = useState<Map<string, any>>(new Map()); // 仓位数据，key为IP
  const [loadingPositions, setLoadingPositions] = useState<Set<string>>(new Set()); // 正在加载仓位的工作机IP集合
  const [showPositionsRows, setShowPositionsRows] = useState<Set<string>>(new Set()); // 显示仓位详情的行（IP集合）
  const [showLimitOrderModal, setShowLimitOrderModal] = useState(false); // 显示限价单对话框
  const [limitOrderData, setLimitOrderData] = useState<{ ip: string; token_id: string; asset: string; title: string; outcome: string; amount: number } | null>(null); // 限价单数据
  const [limitOrderForm, setLimitOrderForm] = useState({ price: '', size_rate: '100' }); // 限价单表单（size_rate为百分比，默认100%）
  const [submittingLimitOrder, setSubmittingLimitOrder] = useState(false); // 正在提交限价单

  // 使用 ref 保存最新状态，避免闭包问题
  const statusesRef = useRef<WorkerStatusType[]>([]);
  const expandedRowsRef = useRef<Set<number>>(new Set());
  const showPositionsRowsRef = useRef<Set<string>>(new Set());

  // 同步 ref 和 state
  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  useEffect(() => {
    expandedRowsRef.current = expandedRows;
  }, [expandedRows]);

  useEffect(() => {
    showPositionsRowsRef.current = showPositionsRows;
  }, [showPositionsRows]);

  // 可选的字段列表
  const availableFields = [
    { key: 'ip', label: 'IP地址' },
    { key: 'server_name', label: '服务器名称' },
    { key: 'proxy_wallet', label: '代理钱包' },
    { key: 'status', label: '状态' },
    { key: 'response_time', label: '响应时间(ms)' },
    { key: 'status_code', label: 'HTTP状态码' },
    { key: 'error_msg', label: '错误信息' },
    { key: 'checked_at', label: '检查时间' },
    { key: 'position_count', label: '持仓数' },
    { key: 'order_count', label: '挂单数' },
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

      // 从 ref 获取最新状态值，避免闭包问题
      const currentStatuses = statusesRef.current;
      const currentExpandedRows = expandedRowsRef.current;
      const currentShowPositionsRows = showPositionsRowsRef.current;

      // 保存当前展开的行ID（基于IP），避免刷新时收回
      const currentExpandedIPs = new Set<string>();
      currentStatuses.forEach(status => {
        if (currentExpandedRows.has(status.id)) {
          currentExpandedIPs.add(status.ip);
        }
      });

      // 保存当前显示仓位信息的IP列表
      const currentPositionsIPs = new Set(currentShowPositionsRows);

      // 传递 hideOffline 参数给后端，让后端过滤掉所有离线机器（包括error状态）
      const response = await workersAPI.getWorkerStatuses(hideOffline);
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
            // 比较检查时间，保留最新的状态
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

        // 恢复展开状态（基于IP匹配）
        const newExpandedRows = new Set<number>();
        uniqueStatuses.forEach(status => {
          if (currentExpandedIPs.has(status.ip)) {
            newExpandedRows.add(status.id);
          }
        });
        setExpandedRows(newExpandedRows);

        // 恢复仓位信息显示状态（基于IP匹配）
        const newShowPositionsRows = new Set<string>();
        currentPositionsIPs.forEach(ip => {
          // 检查新数据中是否还有这个IP
          if (uniqueStatuses.some(s => s.ip === ip)) {
            newShowPositionsRows.add(ip);
          }
        });
        setShowPositionsRows(newShowPositionsRows);

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

  // 获取特定工作机的仓位信息
  const loadWorkerPositions = async (ip: string) => {
    if (loadingPositions.has(ip)) {
      return; // 正在加载中，避免重复请求
    }

    setLoadingPositions(prev => new Set(prev).add(ip));

    try {
      // 使用代理接口获取仓位信息
      const positions = await workersAPI.getWorkerPositions(ip);
      setPositionsData(prev => {
        const newMap = new Map(prev);
        newMap.set(ip, positions);
        return newMap;
      });
      // 展开显示仓位详情
      setShowPositionsRows(prev => new Set(prev).add(ip));
      // 如果行未展开，先展开行
      const status = statuses.find(s => s.ip === ip);
      if (status && !expandedRows.has(status.id)) {
        setExpandedRows(prev => new Set(prev).add(status.id));
      }
      showToast(`${ip}: 仓位信息获取成功`, 'success');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || '获取仓位信息失败';
      showToast(`${ip}: ${errorMsg}`, 'error');
      secureLog.error(`获取工作机 ${ip} 仓位信息失败:`, err);
    } finally {
      setLoadingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(ip);
        return newSet;
      });
    }
  };

  // 打开限价单对话框
  const handleOpenLimitOrder = (ip: string, token_id: string, asset: string, title: string, outcome: string, amount: number) => {
    setLimitOrderData({ ip, token_id, asset, title, outcome, amount });
    setLimitOrderForm({ price: '', size_rate: '100' });
    setShowLimitOrderModal(true);
  };

  // 关闭限价单对话框
  const handleCloseLimitOrder = () => {
    setShowLimitOrderModal(false);
    setLimitOrderData(null);
    setLimitOrderForm({ price: '', size_rate: '100' });
  };

  // 提交限价单
  const handleSubmitLimitOrder = async () => {
    if (!limitOrderData) return;

    const { price, size_rate } = limitOrderForm;
    if (!price || !size_rate) {
      showToast('请填写价格和仓位百分比', 'error');
      return;
    }

    const priceNum = parseFloat(price);
    const sizeRateNum = parseFloat(size_rate);

    if (isNaN(priceNum) || priceNum <= 0) {
      showToast('价格必须是大于0的数字', 'error');
      return;
    }

    if (isNaN(sizeRateNum) || sizeRateNum <= 0 || sizeRateNum > 100) {
      showToast('仓位百分比必须在0到100之间', 'error');
      return;
    }

    setSubmittingLimitOrder(true);
    try {
      // 使用新的改挂限价单接口
      const requestData: any = {
        ip: limitOrderData.ip,
        token_id: limitOrderData.token_id,
        price: priceNum,
      };

      // 如果size_rate不是100%，添加到请求中
      if (sizeRateNum !== 100) {
        requestData.size_rate = sizeRateNum;
      }

      const response = await ordersAPI.modifyLimitOrder(requestData);

      // 根据操作结果显示不同的提示信息
      if (response.success) {
        if (response.action === 'cancel') {
          showToast(`已取消挂单: ${limitOrderData.asset} (${response.canceled_id || ''})`, 'success');
        } else {
          const sizeRateText = sizeRateNum === 100 ? '100%' : `${sizeRateNum}%`;
          showToast(`限价单提交成功: ${limitOrderData.asset} @ ${priceNum} (${sizeRateText}) (${response.order_id || ''})`, 'success');
        }
        handleCloseLimitOrder();
      } else {
        showToast(`${limitOrderData.ip}: ${response.message || '操作失败'}`, 'error');
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || '提交限价单失败';
      showToast(`${limitOrderData.ip}: ${errorMsg}`, 'error');
      secureLog.error(`提交限价单失败:`, err);
    } finally {
      setSubmittingLimitOrder(false);
    }
  };

  // 渲染仓位详情
  const renderPositionsData = (ip: string) => {
    const positions = positionsData.get(ip);
    if (!positions) {
      return null;
    }

    // 解析仓位数据，提取关键信息
    const extractPositions = (data: any): Array<{
      asset?: string;
      title?: string;
      outcome?: string;
      amount?: number;
      price?: number;
      value?: number;
      currentValue?: number;
      cashPnl?: number;
      [key: string]: any;
    }> => {
      if (Array.isArray(data)) {
        return data;
      }
      if (data && typeof data === 'object') {
        // 如果是对象，尝试找到仓位数组
        if (data.positions && Array.isArray(data.positions)) {
          return data.positions;
        }
        if (data.data && Array.isArray(data.data)) {
          return data.data;
        }
        if (data.list && Array.isArray(data.list)) {
          return data.list;
        }
        // 如果对象本身包含仓位信息，转换为数组
        return [data];
      }
      return [];
    };

    const positionsList = extractPositions(positions);

    if (positionsList.length === 0) {
      return (
        <div className="positions-empty">
          <p>暂无仓位数据</p>
        </div>
      );
    }

    return (
      <div className="positions-container">
        <h5 className="positions-title">仓位详情</h5>
        <table className="positions-table">
          <thead>
            <tr>
              <th>代币(Asset)</th>
              <th>Title</th>
              <th>Outcome</th>
              <th>仓位数量</th>
              <th>当前价值</th>
              <th>盈亏</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {positionsList.map((pos, index) => {
              // 提取关键字段（支持多种可能的字段名）
              const asset = pos.asset || pos.tokenId || pos.token_id || pos.id || pos.symbol || '-';
              const token_id = pos.token_id || pos.tokenId || pos.token || pos.id || asset || '-';
              const title = pos.title || pos.Title || pos.TITLE || '-';
              const outcome = pos.outcome || pos.Outcome || pos.OUTCOME || '-';
              const amount = pos.amount || pos.quantity || pos.size || pos.position || 0;
              const currentValue = pos.currentValue || pos.current_value || pos.CurrentValue || pos.CURRENT_VALUE || 0;
              const cashPnl = pos.cashPnl || pos.cash_pnl || pos.CashPnl || pos.CASH_PNL || 0;

              return (
                <tr key={index}>
                  <td>{asset}</td>
                  <td>{title}</td>
                  <td>{outcome}</td>
                  <td>{typeof amount === 'number' ? amount.toLocaleString('zh-CN', { maximumFractionDigits: 8 }) : amount}</td>
                  <td>{typeof currentValue === 'number' ? currentValue.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : currentValue}</td>
                  <td>{typeof cashPnl === 'number' ? cashPnl.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : cashPnl}</td>
                  <td>
                    <button
                      className="limit-order-button"
                      onClick={() => handleOpenLimitOrder(ip, token_id, asset, title, outcome, amount)}
                      disabled={submittingLimitOrder || amount <= 0}
                      title={`为 ${asset} 挂限价单`}
                    >
                      挂限价单
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
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

  // 初始加载：加载状态数据（包含 info 和 status）
  useEffect(() => {
    loadStatuses();
  }, []);

  // 当 hideOffline 状态变化时，重新加载数据
  useEffect(() => {
    loadStatuses();
  }, [hideOffline]);

  // 自动刷新：只刷新动态status数据
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadStatuses();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, hideOffline]);

  // 格式化状态显示
  // error 状态统一显示为 offline（离线）
  const getStatusBadge = (status: string) => {
    // 将 error 状态统一显示为 offline
    const displayStatus = status === 'error' ? 'offline' : status;

    const statusMap: Record<string, { label: string; className: string }> = {
      online: { label: '在线', className: 'status-online' },
      offline: { label: '离线', className: 'status-offline' },
      error: { label: '离线', className: 'status-offline' }, // error 统一显示为离线
    };

    const statusInfo = statusMap[displayStatus] || { label: displayStatus, className: 'status-unknown' };
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

  // 格式化代理钱包地址为缩略显示（前6位...后4位）
  const formatProxyWalletAddress = (address: string): string => {
    if (!address || address.length <= 10) {
      return address;
    }
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
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
          <Card
            title="关键业务指标"
            size="small"
            style={{ marginBottom: 16 }}
            headStyle={{ background: '#e6f7ff', borderBottom: '2px solid #1890ff' }}
          >
            <Descriptions column={3} size="small" bordered>
              {keyItems.map(([key, value]) => (
                <Descriptions.Item
                  key={key}
                  label={<Text strong style={{ color: '#1890ff' }}>{key}</Text>}
                  span={1}
                >
                  <Text strong style={{ color: '#1890ff', fontSize: '16px' }}>
                    {formatValue(value, key)}
                  </Text>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}

        {/* 系统状态 */}
        {importantItems.length > 0 && (
          <Card
            title="系统状态"
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={3} size="small" bordered>
              {importantItems.map(([key, value]) => (
                <Descriptions.Item key={key} label={key} span={1}>
                  {formatValue(value, key)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}

        {/* 其他信息 */}
        {otherItems.length > 0 && (
          <Card
            title="其他信息"
            size="small"
          >
            <Descriptions column={3} size="small" bordered>
              {otherItems.map(([key, value]) => (
                <Descriptions.Item key={key} label={key} span={1}>
                  <Text code style={{ fontSize: '12px' }}>
                    {formatValue(value, key)}
                  </Text>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        )}
      </div>
    );
  };

  // 过滤和排序状态列表
  // 注意：离线机器的过滤现在由后端完成（如果 hideOffline 为 true）
  // 前端这里只做搜索和排序，不再过滤离线机器
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
        case 'ip':
          valueA = (a.ip || '').toLowerCase();
          valueB = (b.ip || '').toLowerCase();
          break;
        case 'server_name':
          valueA = (a.server_name || '').toLowerCase();
          valueB = (b.server_name || '').toLowerCase();
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
          valueA = (a.server_name || '').toLowerCase();
          valueB = (b.server_name || '').toLowerCase();
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
  }, [statuses, searchKeyword, sortField, sortOrder]);

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
      online: filteredAndSortedStatuses.filter((s) => s.status === 'online').length,
      // error 状态统一计入 offline
      offline: filteredAndSortedStatuses.filter((s) => s.status === 'offline' || s.status === 'error').length,
      error: 0, // error 已统一计入 offline，这里设为 0
      totalAssets,
      totalBalance,
    };
  }, [filteredAndSortedStatuses]);

  return (
    <div className="worker-status-container">
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

      <div className="worker-status-header">
        {/* <h2>工作机状态监控</h2> */}
        {/* 刷新按钮已移到操作列标题 */}
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
                      {selectedFields.includes('proxy_wallet') && (
                        <th>代理钱包</th>
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
                      {selectedFields.includes('total_assets') && <th className="key-metric-header">资产总额</th>}
                      {selectedFields.includes('version_number') && <th className="key-metric-header">程序版本号</th>}
                      <th className="action-header">
                        <Space>
                          <span>操作</span>
                          <Tooltip title="刷新列表">
                            <Button
                              type="text"
                              size="small"
                              icon={<ReloadOutlined spin={loading} />}
                              onClick={loadStatuses}
                              disabled={loading}
                              style={{ padding: '0 4px' }}
                            />
                          </Tooltip>
                        </Space>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedStatuses.map((status) => {
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

                      const businessData = Object.keys(mergedData).length > 0 ? mergedData : null;
                      const isExpanded = expandedRows.has(status.id);
                      const colSpan = selectedFields.length + 1; // +1 for 操作列
                      // 使用IP作为key，确保唯一性
                      return (
                        <React.Fragment key={status.ip || status.id}>
                          <tr>
                            {selectedFields.includes('ip') && <td>{status.ip}</td>}
                            {selectedFields.includes('server_name') && <td>{status.server_name || '-'}</td>}
                            {selectedFields.includes('proxy_wallet') && (
                              <td>
                                {(() => {
                                  const proxyAddress = getProxyWalletAddress(status.info_data, status.data);
                                  if (proxyAddress) {
                                    return (
                                      <span
                                        style={{
                                          cursor: 'pointer',
                                          color: '#1890ff',
                                          textDecoration: 'underline',
                                          fontFamily: 'monospace',
                                        }}
                                        onClick={async () => {
                                          try {
                                            await navigator.clipboard.writeText(proxyAddress);
                                            showToast('代理钱包地址已复制到剪贴板', 'success');
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
                                              showToast('代理钱包地址已复制到剪贴板', 'success');
                                            } catch (e) {
                                              showToast('复制失败，请手动复制', 'error');
                                            }
                                            document.body.removeChild(textArea);
                                          }
                                        }}
                                        title={`点击复制完整地址: ${proxyAddress}`}
                                      >
                                        {formatProxyWalletAddress(proxyAddress)}
                                      </span>
                                    );
                                  }
                                  return <span style={{ color: '#999' }}>-</span>;
                                })()}
                              </td>
                            )}
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
                                {getKeyMetricValue(mergedData, 'position_count')}
                              </td>
                            )}
                            {selectedFields.includes('order_count') && (
                              <td className="key-metric-cell">
                                {getKeyMetricValue(mergedData, 'order_count')}
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
                            <td>
                              <Space size="small" wrap>
                                {businessData && (
                                  <Tooltip title={isExpanded ? '收起详情' : '查看详情'}>
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={isExpanded ? <DownOutlined /> : <RightOutlined />}
                                      onClick={() => toggleRowExpansion(status.id)}
                                    />
                                  </Tooltip>
                                )}
                                {(() => {
                                  // 优先从 info_data 中查找代理钱包地址，如果没找到再从 data 中查找
                                  const proxyAddress = getProxyWalletAddress(status.info_data, status.data);
                                  return proxyAddress ? (
                                    <Tooltip title={`复制代理钱包地址: ${proxyAddress}`}>
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<CopyOutlined />}
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
                                      />
                                    </Tooltip>
                                  ) : null;
                                })()}
                                {selectedFile && (
                                  <Tooltip title={`上传文件到 ${status.ip}`}>
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<UploadOutlined />}
                                      loading={uploading.has(status.ip)}
                                      onClick={() => handleUploadFile(status.ip)}
                                      disabled={uploading.has(status.ip)}
                                    />
                                  </Tooltip>
                                )}
                                <Tooltip title={`获取 ${status.ip} 的仓位信息`}>
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<WalletOutlined />}
                                    loading={loadingPositions.has(status.ip)}
                                    onClick={() => loadWorkerPositions(status.ip)}
                                    disabled={loadingPositions.has(status.ip)}
                                  />
                                </Tooltip>
                                <Tooltip title="检查工作机状态">
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<CheckCircleOutlined />}
                                    onClick={() => handleCheckStatus(status.ip)}
                                  />
                                </Tooltip>
                              </Space>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="detail-row">
                              <td colSpan={colSpan} className="detail-cell">
                                <div className="detail-content">
                                  {/* 只显示仓位信息，不显示业务信息 */}
                                  {showPositionsRows.has(status.ip) ? (
                                    <div className="positions-section">
                                      {renderPositionsData(status.ip)}
                                    </div>
                                  ) : businessData ? (
                                    <Card
                                      title={
                                        <Space>
                                          <Text strong>工作机业务信息</Text>
                                          <Tag color="blue">{status.key_name}</Tag>
                                          <Tag color="default">{status.ip}</Tag>
                                        </Space>
                                      }
                                      size="small"
                                    >
                                      {renderBusinessData(businessData)}
                                    </Card>
                                  ) : null}
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

          {/* 统计信息已移到顶部 */}

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

      {/* 限价单对话框 */}
      {showLimitOrderModal && limitOrderData && (
        <div className="modal-overlay" onClick={handleCloseLimitOrder}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>挂限价单</h3>
              <button className="modal-close" onClick={handleCloseLimitOrder}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="limit-order-info">
                <div className="info-item">
                  <label>工作机IP:</label>
                  <span>{limitOrderData.ip}</span>
                </div>
                <div className="info-item">
                  <label>代币(Asset):</label>
                  <span>{limitOrderData.asset}</span>
                </div>
                <div className="info-item">
                  <label>Token ID:</label>
                  <span style={{ fontSize: '11px', wordBreak: 'break-all' }}>{limitOrderData.token_id}</span>
                </div>
                <div className="info-item">
                  <label>Title:</label>
                  <span>{limitOrderData.title}</span>
                </div>
                <div className="info-item">
                  <label>Outcome:</label>
                  <span>{limitOrderData.outcome}</span>
                </div>
                <div className="info-item">
                  <label>当前仓位数量:</label>
                  <span>{limitOrderData.amount.toLocaleString('zh-CN', { maximumFractionDigits: 8 })}</span>
                </div>
              </div>
              <div className="limit-order-form">
                <div className="form-group">
                  <label>限价价格 *</label>
                  <input
                    type="number"
                    step="any"
                    value={limitOrderForm.price}
                    onChange={(e) => setLimitOrderForm({ ...limitOrderForm, price: e.target.value })}
                    placeholder="请输入限价价格"
                    disabled={submittingLimitOrder}
                  />
                </div>
                <div className="form-group">
                  <label>仓位百分比 (%) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={limitOrderForm.size_rate}
                    onChange={(e) => setLimitOrderForm({ ...limitOrderForm, size_rate: e.target.value })}
                    placeholder="请输入仓位百分比 (0-100，默认100%)"
                    disabled={submittingLimitOrder}
                  />
                  <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    默认100%表示使用全部仓位，可指定0-100之间的百分比
                  </small>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={handleCloseLimitOrder}
                  disabled={submittingLimitOrder}
                >
                  取消
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSubmitLimitOrder}
                  disabled={submittingLimitOrder || !limitOrderForm.price || !limitOrderForm.size_rate}
                >
                  {submittingLimitOrder ? '提交中...' : '提交限价单'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

